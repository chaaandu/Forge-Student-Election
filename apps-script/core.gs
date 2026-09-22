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
 * The roll, indexed by id.
 *
 * Cached, because it does not change while voting is open — the Roll tab is
 * seeded once by `setup()` and then only read. Every request was re-reading all
 * 145 rows out of the spreadsheet, and SpreadsheetApp calls are the expensive
 * part of an Apps Script execution by a wide margin.
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
    if (!r[0]) continue;
    out[String(r[0])] = {
      id: String(r[0]),
      name: String(r[1]),
      email: String(r[2]),
      type: String(r[3]),
      house: String(r[4] || ''),
    };
  }

  cache.put('roll', JSON.stringify(out), 1800);
  return out;
}

/** House id from the display name the Roll tab stores. */
function houseIdFromName_(name) {
  if (!name) return null;
  for (var i = 0; i < CONFIG.houses.length; i += 1) {
    if (CONFIG.houses[i].name === name || CONFIG.houses[i].id === name) return CONFIG.houses[i].id;
  }
  return null;
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

// ------------------------------------------------------------- kiosk gate ---

/**
 * An optional password on the whole voting URL.
 *
 * The ballot is public by necessity — voters open it on their own phones — but
 * a public URL is also open to anyone who is sent it, and a link travels
 * further than it is meant to. This puts one shared password in front of
 * starting a ballot at all.
 *
 * Checked HERE, not in the browser. A password the SPA compares is a password
 * shipped inside the JavaScript bundle, readable by anyone who opens developer
 * tools — the same mistake as putting the spreadsheet key in the client. The
 * value lives in Script Properties: not in the repository, not in the bundle,
 * and changeable without touching code.
 *
 * Off unless both properties are set, so deploying this changes nothing until
 * somebody decides to turn it on.
 *
 *   Apps Script → Project Settings → Script Properties
 *     KIOSK_EMAIL     chandu@mesaschool.co
 *     KIOSK_PASSWORD  ••••••••
 *
 * What it is NOT: this does not identify the voter, and it is not a second
 * factor. One password shared by everyone in the room is a door, not an
 * identity. Who may vote is still decided by the roll, and one-vote is still
 * enforced under the lock.
 */
function kioskGate_() {
  var props = PropertiesService.getScriptProperties();
  var email = props.getProperty('KIOSK_EMAIL');
  var password = props.getProperty('KIOSK_PASSWORD');
  if (!email || !password) return null;
  return { email: String(email).trim().toLowerCase(), password: String(password) };
}

/** A signed pass for a device that has been unlocked. Good for a polling day. */
function issuePass_() {
  var expires = Date.now() + 18 * 60 * 60 * 1000;
  var payload = 'kiosk.' + expires;
  return payload + '.' + sign_(payload);
}

function passIsValid_(pass) {
  if (!pass) return false;
  var parts = String(pass).split('.');
  if (parts.length !== 3 || parts[0] !== 'kiosk') return false;
  if (sign_(parts[0] + '.' + parts[1]) !== parts[2]) return false;
  return Number(parts[1]) >= Date.now();
}

/**
 * Refuse anything that starts or advances a ballot without a valid pass.
 *
 * Applied to roll search, check-in and casting — the three that touch the roll
 * or the votes. Reading the candidate list is left open: it is public
 * information, and gating it would mean the gate screen could not tell the
 * voter which election they had arrived at.
 */
function requirePass_(pass) {
  if (!kioskGate_()) return;
  if (!passIsValid_(pass)) {
    throw named_('LOCKED', 'This device has not been unlocked for voting.');
  }
}

function unlock_(email, password) {
  var gate = kioskGate_();
  if (!gate) return { pass: issuePass_() };

  var suppliedEmail = String(email || '')
    .trim()
    .toLowerCase();
  // Compared whole rather than reported field by field: telling someone the
  // address was right and only the password wrong hands them half the answer.
  if (suppliedEmail !== gate.email || String(password || '') !== gate.password) {
    throw named_('BAD_PASSWORD', 'That email and password were not accepted.');
  }
  return { pass: issuePass_() };
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
    if (action === 'lookup') return json_(lookup_(e.parameter.query, e.parameter.pass));
    if (action === 'session') return json_(sessionPayload_(e.parameter.token));
    if (action === 'turnout') return json_(turnout_());
    return fail_('NOT_FOUND', 'Unknown action.', 404);
  } catch (err) {
    return fail_('SERVER_ERROR', String(err && err.message ? err.message : err), 500);
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
    if (body.action === 'unlock') return json_(unlock_(body.email, body.password));
    if (body.action === 'select') return json_(select_(body.voterId, body.pass));
    if (body.action === 'ballot')
      return json_(castBallot_(body.token, body.selections, body.pass));
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
    // Absent on an older deployment, which reads as false — so a ballot built
    // against this never shows a gate the script cannot actually open.
    requiresUnlock: kioskGate_() !== null,
  };
}

/**
 * Type-ahead over the roll.
 *
 * A minimum query length and a hard cap are what stop this becoming a
 * roll-export endpoint, and the email is masked before it leaves.
 */
function lookup_(query, pass) {
  requirePass_(pass);
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
    out.push({
      id: v.id,
      name: v.name,
      maskedEmail: v.email.slice(0, 2) + '•••' + v.email.slice(v.email.indexOf('@')),
      type: v.type,
      houseId: houseIdFromName_(v.house),
      hasVoted: Object.prototype.hasOwnProperty.call(voted, v.id),
    });
    if (out.length >= 9) break;
  }
  out.sort(function (a, b) {
    return a.name < b.name ? -1 : 1;
  });
  return { results: out.slice(0, 8), truncated: out.length > 8 };
}

function select_(voterId, pass) {
  requirePass_(pass);
  var all = roll_();
  var row = all[String(voterId)];
  if (!row) throw named_('NOT_ON_ROLL', 'That name is not on the roll for this election.');

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
function castBallot_(token, selections, pass) {
  requirePass_(pass);
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
    var row = roll_()[voterId];
    if (!row) throw named_('NOT_ON_ROLL', 'That name is not on the roll for this election.');
    var voter = voterOf_(row);

    // Re-checked under the lock, against the sheet, not against anything the
    // client sent or an earlier read believed.
    if (Object.prototype.hasOwnProperty.call(votedSet_(), voter.id)) {
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

    sheet_(TABS.voters)
      .getRange(sheet_(TABS.voters).getLastRow() + 1, 1, 1, 7)
      .setValues([
        [voter.id, voter.name, voter.email, voter.type, row.house, true, now.toISOString()],
      ]);

    SpreadsheetApp.flush();

    return { status: 'recorded', receiptId: ballotId.slice(0, 8), submittedAt: now.toISOString() };
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
