/**
 * Mesa Elections — the whole server, inside Google.
 *
 * Deployed as a Web App, this replaces the Express server and its database for
 * an election that must run from a permanent public URL with nothing to keep
 * switched on. The Google Sheet is the only store.
 *
 * Why this and not a static site that writes to Sheets from the browser:
 * writing to a Sheet needs a credential, and anything a browser holds is
 * published — the key would be in the bundle for anyone to read. This code runs
 * on Google's side of the wire under the deploying account's authority, so
 * there is no credential to leak, and `LockService` gives a real mutex, which
 * is what makes one-person-one-vote enforceable rather than hopeful.
 *
 * What is preserved from the Express version, deliberately:
 *
 *   * Ballot secrecy is a property of the SHAPE of the data, not a policy. The
 *     Voters tab records that a person voted; the Ballots tab records what was
 *     chosen. They share no key, and there is no voter column on a ballot row
 *     anywhere, so "who voted for whom" is unwritable rather than merely
 *     forbidden.
 *   * The client is never trusted. The session token is HMAC-signed here and
 *     carries the voter id; the submission body contains only selections. A
 *     forged voter id has nowhere to land.
 *   * Eligibility comes from configuration, never from a branch on voter type.
 *   * One vote per person, enforced under a lock, re-checked against the sheet
 *     inside it.
 *
 * What is genuinely weaker than the database version, stated plainly:
 *
 *   * There is no append-only hash-chained audit log. A Sheet tab can be edited
 *     by anyone with access to the spreadsheet, so a chain stored there proves
 *     less than one in a database with immutability triggers. Tampering is
 *     detectable by re-verifying, not prevented.
 *   * A spreadsheet editor can alter or delete recorded votes. Under the
 *     database this was structurally impossible. Restrict who the Sheet is
 *     shared with accordingly — that sharing list is now the security boundary.
 *   * Rate limiting is coarse; Apps Script has no per-caller state worth the
 *     name.
 *
 * CONFIG is generated from apps/server/config/election.config.json by
 * `npm run appsscript:build`. Edit that file and regenerate; do not hand-edit
 * the constant, or the ballot and the repository will disagree about the
 * election.
 */

/* global CONFIG */

var TABS = {
  roll: 'Roll',
  voters: 'Voters',
  candidates: 'Candidates',
  ballots: 'Ballots',
  results: 'Results',
};

/** Session lifetime. Long enough to vote, short enough that a walk-away expires. */
var SESSION_MINUTES = 20;

/**
 * Signing secret for session tokens.
 *
 * Stored in Script Properties, not here, so it is not in the repository and can
 * be rotated without a code change. `setup()` generates one if it is missing.
 */
function secret_() {
  var props = PropertiesService.getScriptProperties();
  var value = props.getProperty('SESSION_SECRET');
  if (!value) {
    value = Utilities.base64EncodeWebSafe(
      Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(),
    );
    props.setProperty('SESSION_SECRET', value);
  }
  return value;
}

function book_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var s = book_().getSheetByName(name);
  if (!s) throw new Error('Missing tab: ' + name);
  return s;
}

/** Every row below the header, or [] when only the header exists. */
function rows_(name) {
  var s = sheet_(name);
  var last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, s.getLastColumn()).getValues();
}

// ------------------------------------------------------------------ config ---

function positionById_(id) {
  for (var i = 0; i < CONFIG.positions.length; i += 1) {
    if (CONFIG.positions[i].id === id) return CONFIG.positions[i];
  }
  return null;
}

/**
 * The positions this voter may vote for, in ballot order.
 *
 * The single place eligibility is decided. Everything else — the gate sequence,
 * validation, the weighting below — reads this rather than asking what type the
 * voter is. An employee's sequence simply does not contain the house captains;
 * they are not hidden, they are absent.
 */
function stepsFor_(voter) {
  var steps = [];
  for (var i = 0; i < CONFIG.positions.length; i += 1) {
    var p = CONFIG.positions[i];
    var types = p.eligibility.voterTypes;
    if (types.indexOf(voter.type) === -1) continue;
    if (p.eligibility.houseId && p.eligibility.houseId !== voter.houseId) continue;
    steps.push(p);
  }
  steps.sort(function (a, b) {
    return a.order - b.order;
  });
  return steps;
}

// ------------------------------------------------------------------- roll ---

/**
 * How long the roll is remembered, in seconds.
 *
 * It was half an hour, on the reasoning that the roll does not change while
 * voting is open. It does: the desk adds the staff member nobody put on the
 * list and removes the student who left, straight into the Roll tab. With a
 * thirty-minute memory, the person added was told they were not on the roll
 * and the person removed could still vote, both for up to half an hour.
 *
 * A minute costs one read of a few hundred rows, once a minute. `onEdit` in
 * setup.gs clears it the moment the tab is edited, and this is the backstop
 * for when that does not fire.
 */
var ROLL_CACHE_SECONDS = 60;

/**
 * The roll, indexed by id, read from the Roll tab.
 *
 * The Roll TAB is the roll. `setup()` only seeds it when it is empty, so
 * names added or removed there by hand are what the ballot uses.
 *
 * Deliberately NOT extended to who has voted. That changes constantly, and a
 * stale answer there is the one thing that could let the same person vote
 * twice — see `votedSet_`.
 */
function roll_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('roll');
  if (hit) return JSON.parse(hit);

  var out = {};
  var data = rows_(TABS.roll);
  for (var i = 0; i < data.length; i += 1) {
    var r = data[i];
    var id = String(r[0] || '').trim();
    if (!id) continue;
    out[id] = {
      id: id,
      name: String(r[1] || '').trim(),
      email: String(r[2] || '').trim(),
      /*
        Folded, because people type it. "Employee", " student" and "STUDENT"
        were each a person with no contests at all: eligibility compares this
        against the config exactly, and nothing between the keyboard and that
        comparison said so.
      */
      type: String(r[3] || '').trim().toLowerCase(),
      house: String(r[4] || '').trim(),
    };
  }

  cache.put('roll', JSON.stringify(out), ROLL_CACHE_SECONDS);
  return out;
}

/** Forget the roll, so the next request reads the tab. */
function forgetRoll_() {
  CacheService.getScriptCache().remove('roll');
}

/** House id from the display name the Roll tab stores, or the id itself. */
function houseIdFromName_(name) {
  var wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return null;
  for (var i = 0; i < CONFIG.houses.length; i += 1) {
    var house = CONFIG.houses[i];
    if (house.name.toLowerCase() === wanted || house.id.toLowerCase() === wanted) return house.id;
  }
  return null;
}

/**
 * What is wrong with this row, in words the desk can act on, or null.
 *
 * The roll used to be checked by the config schema before the server would
 * even start. Rows typed into the tab skip that, so the same checks are made
 * here instead — and the one that matters most is the silent one. A student
 * whose house is misspelt does not get an error; they get a ballot with no
 * house captain on it, and lose that vote without anyone ever knowing.
 *
 * Both rules are read from the positions, never from a branch on voter type:
 * a type is valid if some contest admits it, and a house is required if some
 * house-scoped contest admits that type.
 */
function rollProblem_(row) {
  var typeKnown = false;
  var needsHouse = false;
  for (var i = 0; i < CONFIG.positions.length; i += 1) {
    var p = CONFIG.positions[i];
    if (p.eligibility.voterTypes.indexOf(row.type) === -1) continue;
    typeKnown = true;
    if (p.eligibility.houseId) needsHouse = true;
  }

  if (!row.name) return 'has no name';
  if (!typeKnown) {
    return 'has type "' + row.type + '", which is not one of: ' + voterTypes_().join(', ');
  }
  if (needsHouse && !houseIdFromName_(row.house)) {
    return row.house
      ? 'has house "' + row.house + '", which is not one of: ' + houseNames_().join(', ')
      : 'has no house';
  }
  return null;
}

function voterTypes_() {
  var seen = {};
  var out = [];
  for (var i = 0; i < CONFIG.positions.length; i += 1) {
    var types = CONFIG.positions[i].eligibility.voterTypes;
    for (var j = 0; j < types.length; j += 1) {
      if (!seen[types[j]]) out.push(types[j]);
      seen[types[j]] = true;
    }
  }
  return out;
}

function houseNames_() {
  var out = [];
  for (var i = 0; i < CONFIG.houses.length; i += 1) out.push(CONFIG.houses[i].name);
  return out;
}

/** The refusal a voter sees when their row cannot be voted from. */
function rollRefusal_() {
  return named_(
    'NOT_ON_ROLL',
    "Your entry on the roll isn't complete, so you can't vote yet. " +
      'The person running the election can fix this.',
  );
}

function voterOf_(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    type: row.type,
    houseId: houseIdFromName_(row.house),
  };
}

/**
 * Who has already voted, as a set of voter ids.
 *
 * Never cached, and only column A is read. This is the answer the one-vote
 * guarantee turns on: `castBallot_` re-asks it inside the lock, and a cached
 * reply there would be a reply from before the previous voter committed —
 * which is exactly how the same person votes twice.
 *
 * Reading one column rather than the whole tab keeps it cheap enough not to
 * need caching.
 */
function votedSet_() {
  var tab = sheet_(TABS.voters);
  var last = tab.getLastRow();
  if (last < 2) return {};

  var ids = tab.getRange(2, 1, last - 1, 1).getValues();
  var set = {};
  for (var i = 0; i < ids.length; i += 1) {
    if (ids[i][0]) set[String(ids[i][0])] = true;
  }
  return set;
}

/** Column H on the Voters tab, added for the durable replay key below. */
var VOTERS_WIDTH = 8;

/**
 * Make sure column H exists before anything writes to it.
 *
 * A tab created by `insertSheet` has twenty-six columns, so this is normally a
 * no-op. It is here for a spreadsheet someone has trimmed, where a write to H
 * would otherwise throw in the middle of recording a vote.
 */
function ensureVotersWidth_(tab) {
  var have = tab.getMaxColumns();
  if (have < VOTERS_WIDTH) tab.insertColumnsAfter(have, VOTERS_WIDTH - have);
}

/**
 * Who has voted, WITH the submission key that recorded them.
 *
 * The set above answers "has this person voted". This answers the harder
 * question `castBallot_` actually needs: "has this person voted, and was it
 * THIS submission". Without the second half, a vote that was recorded but
 * whose reply never reached the kiosk is indistinguishable from a second
 * attempt to vote — so the retry is refused as ALREADY_VOTED and the voter is
 * told their vote failed, for a vote that is sitting in the sheet.
 *
 * The key is the client's random idempotency key. It is stored beside the
 * participation mark, never beside a ballot, so it links a person to the FACT
 * that they voted and to nothing they chose.
 */
function votedKeys_() {
  var tab = sheet_(TABS.voters);
  var last = tab.getLastRow();
  if (last < 2) return {};

  var width = Math.min(VOTERS_WIDTH, tab.getMaxColumns());
  var rows = tab.getRange(2, 1, last - 1, width).getValues();
  var out = {};
  for (var i = 0; i < rows.length; i += 1) {
    if (!rows[i][0]) continue;
    out[String(rows[i][0])] = {
      key: width >= 8 ? String(rows[i][7] || '') : '',
      at: width >= 7 ? String(rows[i][6] || '') : '',
    };
  }
  return out;
}

// ---------------------------------------------------------------- sessions ---

function sign_(payload) {
  var mac = Utilities.computeHmacSha256Signature(payload, secret_());
  return Utilities.base64EncodeWebSafe(mac).replace(/=+$/, '');
}

function issueToken_(voterId) {
  var expires = Date.now() + SESSION_MINUTES * 60 * 1000;
  var payload = voterId + '.' + expires;
  return payload + '.' + sign_(payload);
}

/**
 * Resolve a token to a voter id, or null.
 *
 * The voter id comes from HERE, never from the request body, which is what
 * makes a forged voterId in a submission harmless: there is no field for it.
 */
function readToken_(token) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 3) return null;
  var payload = parts[0] + '.' + parts[1];
  if (sign_(payload) !== parts[2]) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return parts[0];
}

// ----------------------------------------------------------------- routing ---

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function fail_(code, message, status) {
  return json_({ error: { code: code, message: message, status: status || 400 } });
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'election';
  try {
    if (action === 'election') return json_(electionPayload_());
    if (action === 'lookup') return json_(lookup_(e.parameter.query));
    if (action === 'roll') return json_(rollPayload_());
    if (action === 'session') return json_(sessionPayload_(e.parameter.token));
    if (action === 'turnout') return json_(turnout_());
    return fail_('NOT_FOUND', 'Unknown action.', 404);
  } catch (err) {
    /*
      Keep the code the thrower chose.

      This flattened everything to SERVER_ERROR/500, which loses the one thing
      the client branches on — a refusal the ballot can recover from looked
      identical to the script falling over, so it showed a generic failure
      instead of the right screen. doPost had this right; doGet did not.
    */
    return fail_(
      err && err.code ? err.code : 'SERVER_ERROR',
      String(err && err.message ? err.message : err),
      err && err.code ? 400 : 500,
    );
  }
}

/**
 * POST carries a plain-text body on purpose.
 *
 * A browser sending application/json triggers a CORS preflight, and Apps Script
 * cannot answer an OPTIONS request — the ballot would fail before the vote was
 * ever sent. text/plain keeps it a simple request, which needs no preflight.
 */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return fail_('BAD_REQUEST', 'That submission was not readable. Nothing was recorded.');
  }

  try {
    if (body.action === 'select') return json_(select_(body.voterId));
    if (body.action === 'ballot')
      return json_(castBallot_(body.token, body.selections, body.idempotencyKey));
    return fail_('NOT_FOUND', 'Unknown action.', 404);
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    // Errors thrown below are already voter-facing sentences.
    return fail_(err && err.code ? err.code : 'SERVER_ERROR', message, 400);
  }
}

// ----------------------------------------------------------------- actions ---

function electionPayload_() {
  return {
    election: {
      id: CONFIG.election.id,
      name: CONFIG.election.name,
      status: CONFIG.election.status,
    },
    houses: CONFIG.houses,
    positions: CONFIG.positions,
    candidates: CONFIG.candidates,
    window: CONFIG.election.status === 'open' ? { open: true } : { open: false, reason: 'CLOSED' },
    auth: { mode: 'supervised', supportsRollSearch: true, requiresSupervision: true },
  };
}

/** An address with only enough of it left to tell two similar names apart. */
function mask_(email) {
  var at = String(email || '').indexOf('@');
  if (at < 1) return '';
  return email.slice(0, 2) + '\u2022\u2022\u2022' + email.slice(at);
}

function byName_(a, b) {
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

function rollEntry_(v, voted) {
  return {
    id: v.id,
    name: v.name,
    maskedEmail: mask_(v.email),
    type: v.type,
    houseId: houseIdFromName_(v.house),
    hasVoted: Object.prototype.hasOwnProperty.call(voted, v.id),
  };
}

/**
 * The whole roll, masked, in one request.
 *
 * Type-ahead over 145 people does not need a round trip per keystroke, and on
 * this deployment it cannot afford one. The script answers in about a second,
 * but Google's content layer in front of it was measured between 0.5s and 30s
 * for the same request and drops roughly one reply in three — so every letter
 * typed cost seconds, sometimes twice, and replies landed out of order. No
 * amount of debouncing fixes a transport like that; the only fix is to stop
 * asking it a question per keystroke.
 *
 * So the client fetches this once at check-in and searches it in the browser,
 * which costs nothing and cannot arrive out of order.
 *
 * This is the same disclosure per name as `lookup_` — the same fields, the same
 * masking — delivered in one request instead of many. The minimum query length
 * and the cap of eight never made the roll private on a public URL; they only
 * made enumerating it tedious.
 *
 * `hasVoted` travels with it because it is the one part that changes, and it is
 * what marks a name as already used in the list. It is advisory and may be
 * seconds stale: the binding check is made in `select_`, and again under the
 * lock in `castBallot_`, against the sheet.
 */
function rollPayload_() {
  var all = roll_();
  var voted = votedSet_();
  var out = [];
  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
    out.push(rollEntry_(all[id], voted));
  }
  out.sort(byName_);
  return { voters: out };
}

/**
 * Type-ahead over the roll.
 *
 * Still here, and still correct: it is what the client falls back to when the
 * roll above cannot be fetched, and a search box that does nothing is worse
 * than a slow one. A minimum query length and a hard cap are what stop this
 * becoming a roll-export endpoint, and the email is masked before it leaves.
 */
function lookup_(query) {
  var q = String(query || '')
    .trim()
    .toLowerCase();
  if (q.length < 2) return { results: [], truncated: false };

  var voted = votedSet_();
  var all = roll_();
  var out = [];
  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
    var v = all[id];
    if (v.name.toLowerCase().indexOf(q) === -1 && v.email.toLowerCase().indexOf(q) === -1) continue;
    out.push(rollEntry_(v, voted));
  }

  /*
    Sort, THEN cap.

    This used to stop collecting at nine matches and sort those nine, so the
    eight names shown were whichever the roll happened to be keyed in first,
    alphabetised after the fact. A voter whose name matched could be missing
    from a list that was not even full — on the one screen where failing to
    find yourself stops you voting.
  */
  out.sort(byName_);
  return { results: out.slice(0, 8), truncated: out.length > 8 };
}

function select_(voterId) {
  var all = roll_();
  var row = all[String(voterId)];
  if (!row) throw named_(
      'NOT_ON_ROLL',
      "That name isn't on the roll for this election. The person running it can sort this out.",
    );

  // Refused, not waved through with fewer contests. See `rollProblem_`.
  if (rollProblem_(row)) throw rollRefusal_();

  var voter = voterOf_(row);
  if (Object.prototype.hasOwnProperty.call(votedSet_(), voter.id)) {
    throw named_('ALREADY_VOTED', 'Our records show this person has already voted.');
  }

  var steps = stepsFor_(voter);
  if (steps.length === 0) {
    throw named_('NOT_ELIGIBLE', 'There is nothing on this ballot for this person to vote on.');
  }

  return {
    token: issueToken_(voter.id),
    voter: profile_(voter, steps),
  };
}

function profile_(voter, steps) {
  var ids = [];
  for (var i = 0; i < steps.length; i += 1) ids.push(steps[i].id);
  return {
    id: voter.id,
    name: voter.name,
    email: voter.email,
    type: voter.type,
    houseId: voter.houseId,
    hasVoted: false,
    eligiblePositionIds: ids,
  };
}

function sessionPayload_(token) {
  var voterId = readToken_(token);
  if (!voterId) throw named_('UNAUTHORIZED', 'Your check-in has expired. Check in again to vote.');
  var row = roll_()[voterId];
  if (!row) throw named_('UNAUTHORIZED', 'Your check-in has expired. Check in again to vote.');
  var voter = voterOf_(row);
  return { voter: profile_(voter, stepsFor_(voter)), window: CONFIG.election.status };
}

function named_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Which run of this election we are in.
 *
 * A reset bumps it, and it namespaces the replay memory below. Without that,
 * a kiosk still holding a rehearsal ballot's key after the votes were cleared
 * would be answered from that memory - thanked, and never written to the
 * sheet. Cheap to read: Script Properties, not the spreadsheet.
 */
function ballotEpoch_() {
  var props = PropertiesService.getScriptProperties();
  var value = props.getProperty('BALLOT_EPOCH');
  if (!value) {
    value = '1';
    props.setProperty('BALLOT_EPOCH', value);
  }
  return value;
}

/**
 * The receipt shown to the voter, derived from their SUBMISSION, not their ballot.
 *
 * It used to be the first eight characters of the ballot's UUID. That was fine
 * while it was only ever shown on screen, but the replay path above has to
 * reproduce it from the Voters tab — and storing a piece of the ballot id
 * beside a voter's name would put a link between a person and their anonymous
 * ballot row into the spreadsheet. Ballot secrecy here is a property of the
 * shape of the data; this keeps that shape.
 *
 * Hashing the client's idempotency key gives a receipt that is stable across
 * every retry of the same submission and says nothing about the ballot.
 */
function receiptFor_(key, ballotId) {
  if (!key) return String(ballotId).slice(0, 8);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key);
  var out = '';
  for (var i = 0; i < 4; i += 1) {
    var byte = digest[i] < 0 ? digest[i] + 256 : digest[i];
    out += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return out;
}

/**
 * Record one ballot.
 *
 * Everything that matters happens inside the lock: re-read who has voted, check
 * again, then write. Checking outside it and writing inside would let two
 * submissions for the same person both pass the check before either wrote —
 * which is exactly the race this is here to prevent.
 *
 * The lock is held for the whole read-check-write, and released in `finally` so
 * a thrown validation error cannot wedge the election.
 */
function castBallot_(token, selections, idempotencyKey) {
  /*
    Replay a submission we have already recorded.

    The client has always sent an idempotency key and this ignored it, which was
    fine while nothing retried. It is not fine now: Apps Script's delivery layer
    drops responses often enough that the ballot has to retry, and without this
    the second attempt finds the voter already marked and tells them they have
    already voted — for a vote they just cast and were never told about. The
    vote would be correct and the voter would be certain something had gone
    wrong.

    Cached rather than written to a tab because it is not a record of the
    election, it is a short-lived note to ourselves. Six hours outlasts a
    polling day. A cache miss is still SAFE, just unhelpful: the duplicate is
    refused by the check under the lock, exactly as before.
  */
  var key = idempotencyKey ? String(idempotencyKey) : '';
  var replayKey = key ? 'idem:' + ballotEpoch_() + ':' + key : null;
  if (replayKey) {
    var prior = CacheService.getScriptCache().get(replayKey);
    if (prior) return JSON.parse(prior);
  }

  var voterId = readToken_(token);
  if (!voterId) throw named_('UNAUTHORIZED', 'Your check-in has expired. Check in again to vote.');

  if (CONFIG.election.status !== 'open') {
    throw named_('ELECTION_CLOSED', 'Voting is closed. Nothing was recorded.');
  }

  var lock = LockService.getScriptLock();
  // Long enough to outlast a queue of voters, short enough to fail loudly
  // rather than hang a kiosk forever.
  if (!lock.tryLock(30000)) {
    throw named_('BUSY', 'The election is busy. Nothing was recorded — please try again.');
  }

  try {
    /*
      Asked AGAIN, now that the lock is held.

      The read at the top of this function happens before the wait for the
      lock, so it is a read from before whatever we were waiting for finished.
      When a kiosk retries a submission whose first attempt is still committing,
      that first read misses and this one hits — which is precisely the case
      this exists to answer.
    */
    if (replayKey) {
      var again = CacheService.getScriptCache().get(replayKey);
      if (again) return JSON.parse(again);
    }

    var row = roll_()[voterId];
    if (!row) throw named_(
      'NOT_ON_ROLL',
      "That name isn't on the roll for this election. The person running it can sort this out.",
    );
    // Again here: a check-in lasts twenty minutes, and the row can be edited
    // in between.
    if (rollProblem_(row)) throw rollRefusal_();
    var voter = voterOf_(row);

    // Re-checked under the lock, against the sheet, not against anything the
    // client sent or an earlier read believed.
    var recorded = votedKeys_();
    if (Object.prototype.hasOwnProperty.call(recorded, voter.id)) {
      /*
        THE SAME SUBMISSION, ARRIVING TWICE, IS NOT A SECOND VOTE.

        The cache above is the fast path and it is allowed to miss: it is
        evicted under memory pressure and emptied by a redeploy, both of which
        can happen mid-election. The sheet cannot. So the key that recorded this
        person is stored next to their participation mark, and a retry carrying
        that same key is answered with the receipt it earned rather than being
        told it is a duplicate.

        Without this, the commonest failure on this platform — a reply dropped
        on the way back — tells a voter whose vote IS recorded that they have
        already voted, which reads as the machine accusing them of voting twice.
      */
      if (key && recorded[voter.id].key === key) {
        return {
          status: 'recorded',
          receiptId: receiptFor_(key, ''),
          replayed: true,
          submittedAt: recorded[voter.id].at || new Date().toISOString(),
        };
      }
      throw named_('ALREADY_VOTED', 'Our records show you have already voted.');
    }

    var steps = stepsFor_(voter);
    validate_(steps, selections);

    var now = new Date();
    var ballotId = Utilities.getUuid();
    // Bucketed to the hour on purpose: a precise timestamp on an anonymous
    // ballot, next to a precise timestamp on the participation row, would
    // re-link the two by sorting.
    var hour = Utilities.formatDate(now, 'UTC', "yyyy-MM-dd'T'HH:00'Z'");

    var ballotRows = [];
    for (var i = 0; i < steps.length; i += 1) {
      var positionId = steps[i].id;
      ballotRows.push([
        ballotId,
        CONFIG.election.id,
        voter.type,
        hour,
        positionId,
        selections[positionId],
        'ballot:' + ballotId + ':' + positionId,
      ]);
    }

    // Ballots first, participation second. If the script dies between them the
    // vote exists and the voter can be reconciled from the Ballots tab; the
    // other order would mark someone as voted with no vote recorded.
    sheet_(TABS.ballots)
      .getRange(sheet_(TABS.ballots).getLastRow() + 1, 1, ballotRows.length, 7)
      .setValues(ballotRows);

    var votersTab = sheet_(TABS.voters);
    ensureVotersWidth_(votersTab);
    votersTab
      .getRange(votersTab.getLastRow() + 1, 1, 1, VOTERS_WIDTH)
      .setValues([
        [voter.id, voter.name, voter.email, voter.type, row.house, true, now.toISOString(), key],
      ]);

    SpreadsheetApp.flush();

    var result = {
      status: 'recorded',
      receiptId: receiptFor_(key, ballotId),
      replayed: false,
      submittedAt: now.toISOString(),
    };
    // Stored INSIDE the lock, after the write, so a retry that arrives while
    // the first is still committing waits for the lock rather than racing it.
    if (replayKey) CacheService.getScriptCache().put(replayKey, JSON.stringify(result), 21600);
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Validate against the voter's own sequence, server-side.
 *
 * Rejects the whole ballot rather than dropping the offending line: a ballot
 * that is partly recorded is worse than one refused, because the voter is told
 * it counted.
 */
function validate_(steps, selections) {
  if (!selections || typeof selections !== 'object') {
    throw named_('BALLOT_INVALID', 'That ballot could not be read. Nothing was recorded.');
  }

  var allowed = {};
  for (var i = 0; i < steps.length; i += 1) allowed[steps[i].id] = true;

  for (var key in selections) {
    if (!Object.prototype.hasOwnProperty.call(selections, key)) continue;
    if (!allowed[key]) {
      throw named_('BALLOT_INVALID', 'That ballot included a contest you cannot vote in.');
    }
  }

  for (var j = 0; j < steps.length; j += 1) {
    var positionId = steps[j].id;
    var choice = selections[positionId];
    if (!choice) throw named_('BALLOT_INVALID', 'That ballot was missing a choice.');

    var ok = false;
    for (var k = 0; k < CONFIG.candidates.length; k += 1) {
      var c = CONFIG.candidates[k];
      if (c.id === choice && c.positionId === positionId && c.active !== false) ok = true;
    }
    if (!ok) throw named_('BALLOT_INVALID', 'That ballot named someone who is not standing.');
  }
}

function turnout_() {
  var all = roll_();
  var voted = votedSet_();
  var out = { student: { eligible: 0, voted: 0 }, employee: { eligible: 0, voted: 0 } };
  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
    var t = all[id].type;
    if (!out[t]) continue;
    out[t].eligible += 1;
    if (Object.prototype.hasOwnProperty.call(voted, id)) out[t].voted += 1;
  }
  return out;
}
