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

/* global CONFIG, TABS, sheet_, rows_, positionById_ */

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

function calculateResults_() {
  var counts = tallies_();
  var generatedAt = new Date().toISOString();
  var out = [];

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

    for (var r = 0; r < standing.length; r += 1) {
      var row = standing[r];
      out.push([
        position.title,
        weightingLabel_(position),
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
        generatedAt,
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
function publishResults() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Busy — results were not published.');
  try {
    var values = calculateResults_();
    var tab = sheet_(TABS.results);
    if (tab.getLastRow() > 1) {
      tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).clearContent();
    }
    if (values.length > 0) tab.getRange(2, 1, values.length, 13).setValues(values);
    SpreadsheetApp.flush();
    return values.length;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Keep the Results tab fresh without anyone remembering to.
 *
 * Installed by `setup()` on a one-minute timer. It is cheap — a few hundred
 * rows — and it means the Dashboard is never stale by more than a minute while
 * voting is open.
 */
function scheduledPublish() {
  publishResults();
}

/** A menu on the spreadsheet, so the desk never needs the script editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Election')
    .addItem('Publish results now', 'publishResults')
    .addItem('Set up / repair', 'setup')
    .addToUi();
}
