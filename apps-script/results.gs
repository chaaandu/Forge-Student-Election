/**
 * Results and weighting.
 *
 * The same arithmetic as the TypeScript `election-core`, kept deliberately
 * identical so a result computed here and a result computed there cannot
 * disagree:
 *
 *   share(c,t) = votes(c,t) / totalVotes(position, t)     // 0 if that group cast nothing
 *   final(c)   = Σ_t share(c,t) × effectiveWeight(position, t)
 *
 * No group SIZE appears anywhere. Denominators come from the votes actually
 * cast, so the arithmetic is the same for 119 students or 1,190 — and a
 * position only students may vote for is scored student-only at 100%, resolved
 * from its own eligibility rather than from a special case.
 *
 * Writes the Results tab in the 13-column shape the Dashboard formulas already
 * read, so the existing Dashboard keeps working untouched.
 */

/* global CONFIG, TABS, sheet_, rows_, positionById_, renderDashboard,
   CacheService, PropertiesService, SpreadsheetApp */

/** Matches TIE_TOLERANCE in packages/election-core/src/results.ts. */
var TIE_TOLERANCE = 1e-9;

/**
 * Which voter types count for this position, and with what weight.
 *
 * When only one group is eligible it carries 1.0. When a group is eligible but
 * casts nothing, `renormalise` drops it and rescales so scores stay on a 0–100%
 * scale; `treat-as-zero` keeps the weight and caps the attainable score. The
 * ranking and the winner are identical either way — it is a presentation
 * choice, not an outcome choice.
 */
function effectiveWeights_(position, votesByType) {
  var types = position.eligibility.voterTypes;
  var weights = {};
  var total = 0;

  for (var i = 0; i < types.length; i += 1) {
    var t = types[i];
    var cast = votesByType[t] || 0;
    if (CONFIG.election.zeroTurnoutPolicy === 'renormalise' && cast === 0) continue;
    weights[t] = CONFIG.election.weights[t];
    total += weights[t];
  }

  if (total === 0) return {};
  for (var key in weights) {
    if (Object.prototype.hasOwnProperty.call(weights, key)) weights[key] = weights[key] / total;
  }
  return weights;
}

function weightingLabel_(position) {
  var types = position.eligibility.voterTypes;
  if (types.length === 1) {
    return types[0] === 'student' ? 'Student-only (100%)' : 'Employee-only (100%)';
  }
  return (
    'Weighted ' +
    Math.round(CONFIG.election.weights.student * 100) +
    '/' +
    Math.round(CONFIG.election.weights.employee * 100) +
    ' (student/employee)'
  );
}

/** Every recorded selection, tallied by position, candidate and voter type. */
function tallies_() {
  var data = rows_(TABS.ballots);
  var byPosition = {};

  for (var i = 0; i < data.length; i += 1) {
    var voterType = String(data[i][2]);
    var positionId = String(data[i][4]);
    var candidateId = String(data[i][5]);
    if (!positionId || !candidateId) continue;

    if (!byPosition[positionId]) byPosition[positionId] = { totals: {}, candidates: {} };
    var bucket = byPosition[positionId];
    bucket.totals[voterType] = (bucket.totals[voterType] || 0) + 1;
    if (!bucket.candidates[candidateId]) bucket.candidates[candidateId] = {};
    bucket.candidates[candidateId][voterType] =
      (bucket.candidates[candidateId][voterType] || 0) + 1;
  }

  return byPosition;
}

/**
 * The count, as structured data.
 *
 * Split out from the row writer so the Results tab and the Dashboard read the
 * SAME arithmetic rather than each doing its own. Two tabs quietly disagreeing
 * about who is winning is the one failure neither would announce.
 */
function resultsModel_() {
  var counts = tallies_();
  var generatedAt = new Date();
  var model = [];

  var ordered = CONFIG.positions.slice().sort(function (a, b) {
    return a.order - b.order;
  });

  for (var i = 0; i < ordered.length; i += 1) {
    var position = ordered[i];
    var bucket = counts[position.id] || { totals: {}, candidates: {} };
    var weights = effectiveWeights_(position, bucket.totals);

    var standing = [];
    for (var c = 0; c < CONFIG.candidates.length; c += 1) {
      var cand = CONFIG.candidates[c];
      if (cand.positionId !== position.id || cand.active === false) continue;

      var studentVotes = (bucket.candidates[cand.id] || {}).student || 0;
      var employeeVotes = (bucket.candidates[cand.id] || {}).employee || 0;
      var studentShare = bucket.totals.student ? studentVotes / bucket.totals.student : 0;
      var employeeShare = bucket.totals.employee ? employeeVotes / bucket.totals.employee : 0;

      var studentContribution = (weights.student || 0) * studentShare;
      var employeeContribution = (weights.employee || 0) * employeeShare;

      standing.push({
        candidate: cand.name,
        studentVotes: studentVotes,
        studentPercentage: studentShare * 100,
        studentContribution: studentContribution,
        employeeVotes: employeeVotes,
        employeePercentage: employeeShare * 100,
        employeeContribution: employeeContribution,
        score: studentContribution + employeeContribution,
      });
    }

    /*
      Competition ranking — 1, 1, 3 — matching `rankCandidates` in the domain
      core exactly, including the tolerance.

      Numbering the sorted list 1,2,3 instead would print a tie as a first and a
      second place. That is not a display nicety: it announces a winner of a
      contest that does not have one, and it is the single most consequential
      thing this file could get quietly wrong. Ties are reported, never broken.
    */
    standing.sort(function (a, b) {
      var diff = b.score - a.score;
      if (Math.abs(diff) > TIE_TOLERANCE) return diff;
      // Stable ordering within a tie. Presentation only; `tied` carries the meaning.
      return a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0;
    });

    var index = 0;
    while (index < standing.length) {
      var end = index + 1;
      while (
        end < standing.length &&
        Math.abs(standing[end].score - standing[index].score) <= TIE_TOLERANCE
      ) {
        end += 1;
      }
      for (var g = index; g < end; g += 1) {
        standing[g].rank = index + 1;
        standing[g].tied = end - index > 1;
      }
      index = end;
    }

    model.push({
      positionId: position.id,
      title: position.title,
      houseId: position.houseId || null,
      basis: weightingLabel_(position),
      votesCast: (bucket.totals.student || 0) + (bucket.totals.employee || 0),
      candidates: standing,
      generatedAt: generatedAt,
    });
  }

  return model;
}

function calculateResults_() {
  var model = resultsModel_();
  var out = [];

  for (var i = 0; i < model.length; i += 1) {
    var position = model[i];
    var stamp = position.generatedAt.toISOString();
    for (var r = 0; r < position.candidates.length; r += 1) {
      var row = position.candidates[r];
      out.push([
        position.title,
        position.basis,
        row.candidate,
        row.studentVotes,
        row.studentPercentage,
        row.studentContribution,
        row.employeeVotes,
        row.employeePercentage,
        row.employeeContribution,
        row.score,
        row.rank,
        row.tied,
        stamp,
      ]);
    }
  }

  return out;
}

/**
 * Write a fresh snapshot to the Results tab.
 *
 * Replaces rather than appends: the tab is the current count, and a Dashboard
 * reading a mix of this publish and the last one would show a contest twice.
 * History lives in the Ballots tab, which is only ever added to.
 */
function publishResults(force) {
  /*
    NO SCRIPT LOCK. This is the change that stopped ballots timing out.

    This used to take `LockService.getScriptLock()` - the same lock
    `castBallot_` takes to make one-person-one-vote enforceable. Counting is a
    read; recording a vote is a write; sharing one mutex between them means the
    count blocks the vote.

    What that looked like on the day: nobody had voted, so the count was empty
    and the publish was nearly free. The moment the FIRST ballot landed, every
    minute-trigger from then on had real work to do - tally every selection,
    rewrite the Results tab, then clear and redraw the whole Dashboard. The
    next voter pressed "Cast my vote", queued behind that, and waited past the
    kiosk's own timeout. They were shown "Still sending" for a vote that was
    about to be recorded perfectly.

    Nothing here is part of recording a vote, so nothing here may block one. A
    publish that overlaps a ballot can read a tally one selection short; the
    next publish corrects it. A ballot that cannot be cast corrects nothing.
  */
  var fingerprint = Math.max(0, sheet_(TABS.ballots).getLastRow() - 1);
  var props = PropertiesService.getScriptProperties();

  /*
    An unchanged count is not republished.

    The trigger fires all day whether or not anybody has voted. Rewriting the
    identical Results tab costs a clear, a write and a flush against the
    spreadsheet people are voting into, for a picture nobody can tell apart
    from the one already there.
  */
  if (!force && props.getProperty('RESULTS_AT') === String(fingerprint)) {
    return 0;
  }

  /*
    Two publishes must not overlap.

    Without the lock there is nothing stopping the next trigger starting while
    this one is still drawing, which is how a Dashboard ends up half this
    count and half the last. A cache flag is the right weight for it: it keeps
    publishes off each other without putting anything between a voter and the
    ballot box, and it expires on its own if an execution dies holding it.
  */
  var cache = CacheService.getScriptCache();
  if (!force && cache.get('publishing')) return 0;
  cache.put('publishing', '1', 300);

  var values;
  try {
    values = calculateResults_();
    var tab = sheet_(TABS.results);
    if (tab.getLastRow() > 1) {
      tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).clearContent();
    }
    if (values.length > 0) tab.getRange(2, 1, values.length, 13).setValues(values);
    SpreadsheetApp.flush();

    // Recorded only after the write succeeded, so a publish that threw is
    // retried by the next trigger rather than being remembered as done.
    props.setProperty('RESULTS_AT', String(fingerprint));

    renderDashboard(force);
  } finally {
    cache.remove('publishing');
  }

  return values ? values.length : 0;
}

/**
 * Keep the Results tab fresh without anyone remembering to.
 *
 * Installed by `setup()` on a five-minute timer, not a one-minute one. Every
 * run of this competes with live voting for the same spreadsheet, and the
 * desk does not read the Dashboard once a minute — it glances at it between
 * voters. Five minutes of staleness costs nobody anything; a minute of it cost
 * a voter their submission. "Refresh dashboard" on the Election menu is there
 * for the moment somebody does want it now.
 */
function scheduledPublish() {
  publishResults(false);
}

/** The menu item publishes unconditionally - someone who asks wants it now. */
function publishResultsNow() {
  return publishResults(true) + ' rows published.';
}

/** The menu item redraws unconditionally - someone who asks wants it now. */
function refreshDashboardNow() {
  return renderDashboard(true);
}

/** A menu on the spreadsheet, so the desk never needs the script editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Election')
    .addItem('Publish results now', 'publishResultsNow')
    .addItem('Refresh dashboard', 'refreshDashboardNow')
    .addItem('Set up / repair', 'setup')
    .addSeparator()
    .addItem('Clear all votes…', 'clearAllVotesFromMenu')
    .addToUi();
}
