/**
 * One-time setup, and a repair you can re-run safely.
 *
 * Creates any missing tab with the right header row, seeds the Roll and
 * Candidates from CONFIG, and installs the minute trigger that keeps the
 * Results tab fresh. Idempotent: running it twice changes nothing, which is
 * what makes it safe to reach for when something looks wrong on the day.
 *
 * It deliberately does NOT touch the Voters or Ballots tabs beyond ensuring
 * their headers. Those hold cast votes.
 */

/* global CONFIG, TABS, sheet_, book_, ScriptApp, SpreadsheetApp,
   PropertiesService, CacheService, renderDashboard, forgetRoll_, rows_,
   rollProblem_ */

var HEADERS = {
  Roll: ['voter_id', 'name', 'email', 'type', 'house'],
  // `idempotency_key` is the client's random submission key, kept so a retry
  // of a vote that WAS recorded can be answered with its receipt instead of
  // being refused as a duplicate. It names a submission, never a choice.
  Voters: ['voter_id', 'name', 'email', 'type', 'house', 'has_voted', 'voted_at', 'idempotency_key'],
  Candidates: ['candidate_id', 'name', 'position', 'house', 'photo_url', 'active'],
  Ballots: [
    'ballot_id',
    'election_id',
    'voter_type',
    'submitted_hour',
    'position_id',
    'candidate_id',
    'dedupe_key',
  ],
  Results: [
    'position',
    'weighting_applied',
    'candidate',
    'student_votes',
    'student_percentage',
    'student_contribution',
    'employee_votes',
    'employee_percentage',
    'employee_contribution',
    'weighted_score',
    'rank',
    'tied',
    'generated_at',
  ],
};

function houseName_(houseId) {
  for (var i = 0; i < CONFIG.houses.length; i += 1) {
    if (CONFIG.houses[i].id === houseId) return CONFIG.houses[i].name;
  }
  return '';
}

function setup() {
  var book = book_();

  for (var name in HEADERS) {
    if (!Object.prototype.hasOwnProperty.call(HEADERS, name)) continue;
    var tab = book.getSheetByName(name) || book.insertSheet(name);
    tab.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    tab.setFrozenRows(1);
  }

  /*
    THE ROLL IS SEEDED ONCE, NEVER OVERWRITTEN.

    This used to rewrite the Roll tab from Config.gs on every run. That was
    right while the roll lived only in the repository, and wrong the moment
    the desk started adding and removing people in the tab itself — "Set up /
    repair" is exactly what someone reaches for when something looks off, and
    it silently threw away every name typed in by hand.

    So the Roll tab is now the roll. It is filled from Config.gs only when it
    is empty; reloading it over the top of edits is a separate, deliberate
    menu item: Election → Replace roll from Config.gs…
  */
  var roll = sheet_(TABS.roll);
  var rollNote;
  if (roll.getLastRow() < 2) {
    rollNote = writeRollFromConfig_() + ' on the roll, seeded from Config.gs';
  } else {
    rollNote = roll.getLastRow() - 1 + ' on the roll, kept as it is';
  }

  var candidates = sheet_(TABS.candidates);
  if (candidates.getLastRow() > 1) {
    candidates
      .getRange(2, 1, candidates.getLastRow() - 1, candidates.getLastColumn())
      .clearContent();
  }
  var candidateRows = [];
  for (var c = 0; c < CONFIG.candidates.length; c += 1) {
    var cand = CONFIG.candidates[c];
    var position = null;
    for (var p = 0; p < CONFIG.positions.length; p += 1) {
      if (CONFIG.positions[p].id === cand.positionId) position = CONFIG.positions[p];
    }
    candidateRows.push([
      cand.id,
      cand.name,
      position ? position.title : cand.positionId,
      position && position.houseId ? houseName_(position.houseId) : '',
      cand.photoUrl || '',
      cand.active !== false,
    ]);
  }
  candidates.getRange(2, 1, candidateRows.length, 6).setValues(candidateRows);

  installTrigger_();
  SpreadsheetApp.flush();

  // `setup` is exactly what someone runs when the roll looks wrong, so the
  // ballot should see the tab as it is now, not as it was a minute ago.
  forgetRoll_();

  return (
    'Ready. ' +
    rollNote +
    '. ' +
    CONFIG.candidates.length +
    ' candidates, ' +
    CONFIG.positions.length +
    ' contests.'
  );
}

/** Replace the Roll tab's rows with the roll in Config.gs. Returns the count. */
function writeRollFromConfig_() {
  var roll = sheet_(TABS.roll);
  if (roll.getLastRow() > 1) roll.deleteRows(2, roll.getLastRow() - 1);
  if (roll.getMaxRows() < 2) roll.insertRowsAfter(1, 200);

  var rows = [];
  var source = CONFIG.roll || [];
  for (var r = 0; r < source.length; r += 1) {
    var v = source[r];
    rows.push([v.id, v.name, v.email, v.type, houseName_(v.houseId)]);
  }
  if (rows.length > 0) {
    if (roll.getMaxRows() < rows.length + 1) {
      roll.insertRowsAfter(roll.getMaxRows(), rows.length + 1 - roll.getMaxRows());
    }
    roll.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  forgetRoll_();
  return rows.length;
}

/**
 * Throw away the Roll tab and reload it from Config.gs, with a confirmation.
 *
 * For when the repository's voters.json is the one that was corrected. It
 * says how many rows the tab has now and how many it will have after, because
 * the number that disappears is the hand edits, and those are the thing a
 * person would want to know they are about to lose.
 */
function replaceRollFromConfig() {
  var ui = uiOrExplain_('Election \u2192 Replace roll from Config.gs\u2026');
  var now = Math.max(0, sheet_(TABS.roll).getLastRow() - 1);
  var next = CONFIG.roll ? CONFIG.roll.length : 0;

  var answer = ui.alert(
    'Replace the roll?',
    'The Roll tab has ' + now + ' people. Config.gs has ' + next + '.\n\n' +
      'Every row on the Roll tab is replaced, including anyone added or removed by hand. ' +
      'Votes already cast are not touched.\n\nContinue?',
    ui.ButtonSet.YES_NO,
  );
  if (answer !== ui.Button.YES) return;

  var written = writeRollFromConfig_();
  ui.alert('Done', 'The roll now has ' + written + ' people, from Config.gs.', ui.ButtonSet.OK);
}

/**
 * Read the Roll tab and say what is wrong with it.
 *
 * Run it after any edit to the roll. The failures it looks for are the ones
 * the ballot cannot report on its own: a duplicate id means one of two people
 * cannot vote, a duplicate email usually means the same person was added
 * twice, and a misspelt house quietly costs a student their house captain
 * vote — see `rollProblem_`.
 */
function checkRoll() {
  forgetRoll_();
  var data = rows_(TABS.roll);
  var problems = [];
  var ids = {};
  var emails = {};
  var counts = {};

  for (var i = 0; i < data.length; i += 1) {
    var line = i + 2;
    var id = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    if (!id && !name) continue;
    if (!id) {
      problems.push('Row ' + line + ' (' + name + ') has no voter_id, so they cannot be found.');
      continue;
    }
    if (ids[id]) {
      problems.push(
        'Row ' + line + ' repeats voter_id "' + id + '" from row ' + ids[id] +
          '. Only one of them can vote.',
      );
    }
    ids[id] = line;

    var email = String(data[i][2] || '').trim().toLowerCase();
    if (email) {
      if (emails[email]) {
        problems.push('Row ' + line + ' repeats the email on row ' + emails[email] + '.');
      }
      emails[email] = line;
    }

    var row = {
      id: id,
      name: name,
      type: String(data[i][3] || '').trim().toLowerCase(),
      house: String(data[i][4] || '').trim(),
    };
    var problem = rollProblem_(row);
    if (problem) problems.push('Row ' + line + ' (' + (name || id) + ') ' + problem + '.');
    else counts[row.type] = (counts[row.type] || 0) + 1;
  }

  var summary = [];
  for (var type in counts) {
    if (Object.prototype.hasOwnProperty.call(counts, type)) summary.push(counts[type] + ' ' + type);
  }
  var head = 'Ready to vote: ' + (summary.join(', ') || 'nobody') + '.';
  var message = problems.length
    ? head + '\n\n' + problems.length + ' to fix:\n' + problems.slice(0, 20).join('\n') +
      (problems.length > 20 ? '\n\u2026and ' + (problems.length - 20) + ' more.' : '')
    : head + '\n\nNothing to fix.';

  try {
    SpreadsheetApp.getUi().alert(problems.length ? 'The roll needs fixing' : 'The roll is fine', message,
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (noUi) {
    // Run from the editor: the answer goes to the execution log instead.
  }
  return message;
}

/**
 * The moment the Roll tab is edited, the ballot stops remembering the old one.
 *
 * A simple trigger, so it needs no installing and runs for whoever makes the
 * edit. It also clears both publish fingerprints, so the Dashboard's "X of Y
 * have voted" picks up the new Y at the next refresh instead of waiting for
 * someone to vote. Wrapped, because nothing that fails here may stop someone
 * editing their own spreadsheet; the one-minute cache is the backstop.
 */
function onEdit(e) {
  try {
    if (!e || !e.range || e.range.getSheet().getName() !== TABS.roll) return;
    forgetRoll_();
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('RESULTS_AT');
    props.deleteProperty('DASHBOARD_AT');
  } catch (ignored) {
    // See above.
  }
}

/**
 * One trigger for the results snapshot, never two, and never a fast one.
 *
 * It ran every minute. Counting reads every ballot and redraws the whole
 * Dashboard, and it does that against the spreadsheet people are voting into -
 * so once the first vote was cast, roughly half of every minute was spent
 * republishing a count nobody was looking at yet, while a voter waited behind
 * it. Five minutes is well inside what the desk needs, and `publishResults`
 * now does nothing at all when the count has not moved.
 */
function installTrigger_() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i += 1) {
    if (existing[i].getHandlerFunction() === 'scheduledPublish') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('scheduledPublish').timeBased().everyMinutes(5).create();
}

/**
 * The spreadsheet's UI, or a sentence saying where the button is.
 *
 * There is no UI to put a dialog in when a menu action is run from the script
 * editor, and Google's own words for that are "Cannot call
 * SpreadsheetApp.getUi() from this context" — which names a method nobody
 * clicked. The destructive actions keep their confirmations in those dialogs,
 * so they deliberately do not fall back to running without them.
 */
function uiOrExplain_(where) {
  try {
    return SpreadsheetApp.getUi();
  } catch (noUi) {
    throw new Error(
      'Run this from the spreadsheet, not the script editor: reload the Sheet, then ' + where +
        ' . It has to ask you to confirm first, and there is nowhere to ask from here.',
    );
  }
}

/**
 * Clear the votes, from the Sheet's own menu, with a confirmation.
 *
 * The typed-name guard below is the real protection; this is the way to reach
 * it without opening the script editor. Two dialogs on purpose: the first says
 * plainly what is about to be destroyed and how much of it there is, the second
 * makes you type the election's name. Clearing an election should take a moment
 * of deliberate effort, and a single "are you sure?" is a reflex people learn
 * to click through.
 */
function clearAllVotesFromMenu() {
  // See `uiOrExplain_`: the typed-name guard lives in these dialogs.
  var ui = uiOrExplain_('Election \u2192 Clear all votes\u2026');

  var ballots = Math.max(0, sheet_(TABS.ballots).getLastRow() - 1);
  var voters = Math.max(0, sheet_(TABS.voters).getLastRow() - 1);

  if (voters === 0 && ballots === 0) {
    ui.alert('Nothing to clear', 'No votes have been recorded yet.', ui.ButtonSet.OK);
    return;
  }

  var warn = ui.alert(
    'Clear every vote?',
    voters +
      ' people have voted, across ' +
      ballots +
      ' recorded selections.\n\n' +
      'This permanently deletes the Voters, Ballots and Results tabs back to their headers. ' +
      'It cannot be undone, and there is no copy anywhere else.\n\nContinue?',
    ui.ButtonSet.YES_NO,
  );
  if (warn !== ui.Button.YES) return;

  var typed = ui.prompt(
    'Type the election name to confirm',
    'Enter exactly:  ' + CONFIG.election.name,
    ui.ButtonSet.OK_CANCEL,
  );
  if (typed.getSelectedButton() !== ui.Button.OK) return;

  try {
    var result = resetElectionDestructively(typed.getResponseText().trim());
    ui.alert('Done', result, ui.ButtonSet.OK);
  } catch (err) {
    // Not "nothing was cleared" — the reset verifies itself now, and the
    // message it throws says exactly how much it could not shift.
    ui.alert('The reset did not finish', String(err && err.message ? err.message : err), ui.ButtonSet.OK);
  }
}

/**
 * Destroy every cast vote and start over.
 *
 * Named so nobody runs it by accident, and it refuses unless handed the
 * election's own name — the same guard the Express version used, for the same
 * reason: this is the only way to remove a ballot, and it should never be a
 * reflex.
 */
function resetElectionDestructively(confirmElectionName) {
  if (confirmElectionName !== CONFIG.election.name) {
    throw new Error(
      'Refusing to reset. Call this with the election name exactly: ' + CONFIG.election.name,
    );
  }
  var names = [TABS.voters, TABS.ballots, TABS.results];
  for (var i = 0; i < names.length; i += 1) {
    var tab = sheet_(names[i]);
    var last = tab.getLastRow();
    if (last > 1) {
      /*
        ROWS DELETED, not emptied.

        This used to call clearContent(), which blanks the cells and leaves the
        rows exactly where they were. A row that still exists still counts
        towards getLastRow(), and getLastRow() is what the publish fingerprint,
        the dashboard and the next ballot's insert point are all derived from -
        so a sheet that looked empty went on reporting votes that were gone,
        and the next vote was written below the ghosts rather than at the top.
      */
      tab.deleteRows(2, last - 1);
    }
    // deleteRows can take the tab down to its header alone, and appending to a
    // sheet with one row throws. Give the next election somewhere to land.
    if (tab.getMaxRows() < 2) tab.insertRowsAfter(1, 200);
  }

  /*
    THE REPLAY WINDOW IS CLOSED TOO.

    `castBallot_` answers a repeated submission with the receipt it already
    earned, which is what stops a dropped reply looking like a double vote. It
    remembers those for six hours - comfortably longer than the gap between a
    rehearsal and the real thing.

    Left alone across a reset, a kiosk still holding a rehearsal ballot's key
    would be told "recorded" from that memory, and nothing would be written.
    The voter would be thanked and would not be counted, which is the one
    failure this system must never produce. Bumping the epoch makes every key
    issued before the reset unrecognisable, so a resubmission is a real vote.
  */
  var props = PropertiesService.getScriptProperties();
  var epoch = Number(props.getProperty('BALLOT_EPOCH') || 1) + 1;
  props.setProperty('BALLOT_EPOCH', String(epoch));

  // Both publish guards key off the ballot count, and a reset takes it to a
  // number it has held before. Cleared explicitly so the next publish redraws
  // rather than deciding the empty sheet it is looking at is already current.
  props.deleteProperty('RESULTS_AT');
  props.deleteProperty('DASHBOARD_AT');

  SpreadsheetApp.flush();

  /*
    The Dashboard is redrawn NOW, not at the next trigger.

    It is the tab everyone actually looks at, and it is drawn from the count
    rather than being part of it - so clearing the votes left it showing the
    old turnout and the old leaders for up to five minutes. Somebody checking
    that the reset worked read that as a vote that would not clear.
  */
  renderDashboard(true);

  /*
    Read back, rather than assume.

    A reset that quietly half-worked is worse than one that failed, because
    nobody looks again. These are counted from the sheet after the fact.
  */
  var left =
    Math.max(0, sheet_(TABS.voters).getLastRow() - 1) +
    Math.max(0, sheet_(TABS.ballots).getLastRow() - 1) +
    Math.max(0, sheet_(TABS.results).getLastRow() - 1);
  if (left > 0) {
    throw new Error(
      'Cleared what it could, but ' + left + ' row(s) are still on the Voters, Ballots or ' +
        'Results tabs. Check for a filter or a protected range on those tabs, then run it again.',
    );
  }

  return 'Cleared. Every cast vote has been destroyed, and the dashboard is back to zero.';
}
