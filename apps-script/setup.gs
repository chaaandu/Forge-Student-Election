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
   PropertiesService, CacheService */

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

  // Seed the two tabs that do not change during the election. Rewritten in
  // full rather than appended, so a re-run after a candidate is corrected
  // replaces the old row instead of adding a second one.
  var roll = sheet_(TABS.roll);
  if (roll.getLastRow() > 1) {
    roll.getRange(2, 1, roll.getLastRow() - 1, roll.getLastColumn()).clearContent();
  }
  if (CONFIG.roll && CONFIG.roll.length > 0) {
    var rollRows = [];
    for (var r = 0; r < CONFIG.roll.length; r += 1) {
      var v = CONFIG.roll[r];
      rollRows.push([v.id, v.name, v.email, v.type, houseName_(v.houseId)]);
    }
    roll.getRange(2, 1, rollRows.length, 5).setValues(rollRows);
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

  // The roll is cached for half an hour, so a re-seed would otherwise not be
  // visible to the ballot until that expired — and `setup` is exactly what
  // someone runs when the roll looks wrong.
  CacheService.getScriptCache().remove('roll');

  return (
    'Ready. ' +
    (CONFIG.roll ? CONFIG.roll.length : 0) +
    ' on the roll, ' +
    CONFIG.candidates.length +
    ' candidates, ' +
    CONFIG.positions.length +
    ' contests.'
  );
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
  var ui = SpreadsheetApp.getUi();

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
    ui.alert('Nothing was cleared', String(err && err.message ? err.message : err), ui.ButtonSet.OK);
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
  for (var i = 0; i < [TABS.voters, TABS.ballots, TABS.results].length; i += 1) {
    var name = [TABS.voters, TABS.ballots, TABS.results][i];
    var tab = sheet_(name);
    if (tab.getLastRow() > 1) {
      tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).clearContent();
    }
  }
  SpreadsheetApp.flush();
  // Both publish guards key off the ballot count, and a reset takes it to a
  // number it has held before. Cleared explicitly so the next publish redraws
  // rather than deciding the empty sheet it is looking at is already current.
  PropertiesService.getScriptProperties().deleteProperty('RESULTS_AT');
  PropertiesService.getScriptProperties().deleteProperty('DASHBOARD_AT');
  return 'Cleared. Every cast vote has been destroyed.';
}
