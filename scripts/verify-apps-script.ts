#!/usr/bin/env tsx
/**
 * Prove the Apps Script agrees with the tested domain core.
 *
 * The election logic now exists twice: once in `packages/election-core`, which
 * has 500-odd tests behind it, and once in `apps-script/`, rewritten in the
 * ES5-ish dialect Apps Script runs. Two implementations of the same rules will
 * drift, and the way that drift shows up is a wrong winner — computed
 * confidently, with no error anywhere.
 *
 * So the second implementation is checked against the first, on the same
 * inputs, over the real election configuration. The .gs files are loaded into a
 * VM with Google's globals stubbed, because there is no other way to execute
 * them off Google's servers.
 *
 *   npm run appsscript:verify
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { calculateResults, buildSteps, type ElectionConfig } from '@mesa/election-core';

const ROOT = new URL('..', import.meta.url);
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, ROOT)), 'utf8');

const config = JSON.parse(read('apps/server/config/election.config.json')) as ElectionConfig;

// ------------------------------------------------- the Apps Script sandbox ---

type Row = (string | number | boolean)[];
let BALLOT_ROWS: Row[] = [];
const ROLL_ROWS: Row[] = [];

const sandbox: Record<string, unknown> = {
  ROLL_ROWS,
  console,
  Date,
  JSON,
  Math,
  Object,
  Number,
  String,
  Error,
  // Google's globals, stubbed to the surface the scripts actually touch.
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: () => 'test-secret',
      setProperty: () => {},
    }),
  },
  Utilities: {
    getUuid: () => 'uuid-0000',
    formatDate: () => '2026-09-22T10:00Z',
    computeHmacSha256Signature: (payload: string) => Array.from(Buffer.from(payload)),
    base64EncodeWebSafe: (bytes: number[] | string) =>
      Buffer.from(bytes as number[]).toString('base64url'),
  },
  SpreadsheetApp: {
    flush: () => {},
    getActiveSpreadsheet: () => ({}),
    BorderStyle: { SOLID: 'SOLID' },
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: {} },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({}) },
};

const context = createContext(sandbox);
runInContext(read('apps-script/Config.gs'), context);
runInContext(read('apps-script/core.gs'), context);
runInContext(read('apps-script/results.gs'), context);
runInContext(read('apps-script/dashboard.gs'), context);

// The two functions that read the sheet are replaced with fixtures.
runInContext(
  `
  rows_ = function (name) {
    if (name === TABS.ballots) return BALLOT_ROWS;
    if (name === TABS.roll) return ROLL_ROWS;
    return [];
  };
  sheet_ = function () { throw new Error('not needed'); };
`,
  context,
);

let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : `  ${detail}`}`);
};

// ------------------------------------------------------- config fidelity ---

/*
  Nothing may be lost between the config and the generated script.

  `crestUrl` went missing from houses and every house rendered its drawn
  placeholder instead of its crest — four coloured blocks on the ballot, with
  nothing logged, because a missing optional field simply takes the fallback
  path that exists for exactly that case. A shape check catches the whole class
  rather than that one field.
*/
console.log('\nconfig fidelity');

const generated = runInContext('CONFIG', context) as {
  houses: Record<string, unknown>[];
  positions: Record<string, unknown>[];
  candidates: Record<string, unknown>[];
};

for (const key of ['houses', 'positions', 'candidates'] as const) {
  const fieldsOf = (rows: Record<string, unknown>[]) =>
    [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  const source = fieldsOf(config[key] as unknown as Record<string, unknown>[]);
  const emitted = fieldsOf(generated[key]);
  const missing = source.filter((f) => !emitted.includes(f));
  check(missing.length === 0, `${key} keep every field`, `dropped: ${missing.join(', ')}`);
}

// --------------------------------------------------------- eligibility ---

console.log('\neligibility and step sequences');

for (const voter of [
  { id: 'v1', name: 'S', email: 's@x', type: 'student' as const, houseId: 'samurai' },
  { id: 'v2', name: 'S', email: 's@x', type: 'student' as const, houseId: 'vikings' },
  { id: 'v3', name: 'E', email: 'e@x', type: 'employee' as const },
]) {
  const expected = buildSteps(config, voter).map((s) => s.id);
  sandbox.__voter = voter;
  const actual = runInContext(
    'stepsFor_(__voter).map(function (s) { return s.id; })',
    context,
  ) as string[];
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${voter.type}${voter.houseId ? ` (${voter.houseId})` : ''} gets ${expected.length} contests`,
    `core=${JSON.stringify(expected)} script=${JSON.stringify(actual)}`,
  );
}

// ------------------------------------------------------ a hand-edited roll ---

/*
  The Roll tab is edited by hand during the election: the desk adds the staff
  member nobody listed and removes the student who left. Rows typed there skip
  the config schema the repository roll goes through, so the script has to be
  forgiving about how they are typed and strict about what they mean.

  The failure this guards against is the silent one. A student whose house is
  misspelt used to get no error at all: they got a ballot without their house
  captain on it, and lost that vote without anyone knowing.
*/
console.log('\na hand-edited roll');

const aHouse = config.houses[0]!;
ROLL_ROWS.push(
  ['emp-typed', 'Typed Employee', 'e@x', ' Employee ', ''],
  ['stu-typed', 'Typed Student', 's@x', 'STUDENT', ` ${aHouse.name.toUpperCase()} `],
  ['stu-misspelt', 'Misspelt House', 'm@x', 'student', 'Atlantis'],
  ['stu-houseless', 'No House', 'n@x', 'student', ''],
  ['x-staff', 'Wrong Type', 'w@x', 'staff', ''],
  ['', 'No Id', 'i@x', 'student', aHouse.name],
);

const roll = runInContext('roll_()', context) as Record<string, { type: string; house: string }>;
const problemOf = (id: string) =>
  runInContext(`rollProblem_(roll_()[${JSON.stringify(id)}])`, context) as string | null;
const contestsOf = (id: string) =>
  runInContext(`stepsFor_(voterOf_(roll_()[${JSON.stringify(id)}])).length`, context) as number;

const employeeContests = buildSteps(config, { id: 'e', name: 'E', email: 'e@x', type: 'employee' }).length;
const studentContests = buildSteps(config, {
  id: 's', name: 'S', email: 's@x', type: 'student', houseId: aHouse.id,
}).length;

check(roll['emp-typed']?.type === 'employee', 'a type typed as " Employee " is read as employee');
check(
  problemOf('emp-typed') === null && contestsOf('emp-typed') === employeeContests,
  `...and gets the employee ballot (${employeeContests} contests)`,
  `problem=${problemOf('emp-typed')} contests=${contestsOf('emp-typed')}`,
);
check(
  problemOf('stu-typed') === null && contestsOf('stu-typed') === studentContests,
  `a house typed in capitals still finds the house (${studentContests} contests)`,
  `problem=${problemOf('stu-typed')} contests=${contestsOf('stu-typed')}`,
);
check(
  /house/.test(problemOf('stu-misspelt') ?? ''),
  'a misspelt house is refused, not given a ballot with no house captain',
  `problem=${problemOf('stu-misspelt')}`,
);
check(/house/.test(problemOf('stu-houseless') ?? ''), 'a student with no house is refused');
check(/type/.test(problemOf('x-staff') ?? ''), 'an unknown voter type is refused');
check(!('' in roll) && Object.keys(roll).length === 5, 'a row with no voter_id is skipped');

let refusedAtCheckIn = '';
try {
  runInContext('select_("stu-misspelt")', context);
} catch (error) {
  refusedAtCheckIn = (error as { code?: string }).code ?? '';
}
check(
  refusedAtCheckIn === 'NOT_ON_ROLL',
  'check-in refuses a row that cannot be voted from',
  `got ${refusedAtCheckIn || 'no refusal'}`,
);

// ------------------------------------------------------------ weighting ---

console.log('\nweighting, against the tested core');

/** Build synthetic ballots and the matching tallies for both implementations. */
function scenario(
  name: string,
  votes: { position: string; candidate: string; type: string; n: number }[],
) {
  BALLOT_ROWS = [];
  sandbox.BALLOT_ROWS = BALLOT_ROWS;
  const tallies: { positionId: string; candidateId: string; voterType: string; votes: number }[] =
    [];

  for (const v of votes) {
    for (let i = 0; i < v.n; i += 1) {
      BALLOT_ROWS.push([`b${i}`, config.election.id, v.type, 'h', v.position, v.candidate, 'd']);
    }
    tallies.push({
      positionId: v.position,
      candidateId: v.candidate,
      voterType: v.type,
      votes: v.n,
    });
  }
  sandbox.BALLOT_ROWS = BALLOT_ROWS;

  const expected = calculateResults({
    config,
    tallies: tallies as never,
  });
  const actual = runInContext('calculateResults_()', context) as unknown[][];

  // Compare score and rank per position+candidate.
  const actualByKey = new Map<string, { score: number; rank: number }>();
  for (const row of actual) {
    actualByKey.set(`${row[0]}|${row[2]}`, { score: Number(row[9]), rank: Number(row[10]) });
  }

  let ok = true;
  const notes: string[] = [];
  for (const position of expected.positions) {
    for (const entry of position.candidates) {
      const key = `${position.positionTitle}|${entry.candidateName}`;
      const got = actualByKey.get(key);
      if (!got) {
        ok = false;
        notes.push(`missing ${key}`);
        continue;
      }
      if (Math.abs(got.score - entry.finalScore) > 1e-9) {
        ok = false;
        notes.push(`${key}: core=${entry.finalScore} script=${got.score}`);
      }
      if (got.rank !== entry.rank) {
        ok = false;
        notes.push(`${key}: rank core=${entry.rank} script=${got.rank}`);
      }
    }
  }
  check(ok, name, notes.slice(0, 3).join('; '));
}

scenario('a straight two-way contest, both electorates voting', [
  {
    position: 'president',
    candidate: config.candidates.find((c) => c.positionId === 'president')!.id,
    type: 'student',
    n: 40,
  },
  {
    position: 'president',
    candidate: config.candidates.filter((c) => c.positionId === 'president')[1]!.id,
    type: 'student',
    n: 20,
  },
  {
    position: 'president',
    candidate: config.candidates.find((c) => c.positionId === 'president')!.id,
    type: 'employee',
    n: 3,
  },
  {
    position: 'president',
    candidate: config.candidates.filter((c) => c.positionId === 'president')[1]!.id,
    type: 'employee',
    n: 9,
  },
]);

scenario('employees eligible but casting nothing (renormalise)', [
  {
    position: 'president',
    candidate: config.candidates.find((c) => c.positionId === 'president')!.id,
    type: 'student',
    n: 11,
  },
  {
    position: 'president',
    candidate: config.candidates.filter((c) => c.positionId === 'president')[1]!.id,
    type: 'student',
    n: 4,
  },
]);

const captain = config.positions.find((p) => p.kind === 'house-captain')!;
const captainCandidates = config.candidates.filter((c) => c.positionId === captain.id);
scenario('a house captain — student-only, uncapped', [
  { position: captain.id, candidate: captainCandidates[0]!.id, type: 'student', n: 7 },
  { position: captain.id, candidate: captainCandidates[1]!.id, type: 'student', n: 2 },
]);

scenario('an exact tie', [
  {
    position: 'president',
    candidate: config.candidates.find((c) => c.positionId === 'president')!.id,
    type: 'student',
    n: 5,
  },
  {
    position: 'president',
    candidate: config.candidates.filter((c) => c.positionId === 'president')[1]!.id,
    type: 'student',
    n: 5,
  },
]);

scenario('no votes cast at all', []);

// ------------------------------------------------------------- dashboard ---

/*
  THE DASHBOARD IS RENDERED, NOT JUST COMPUTED.

  A tied contest wrote "= " in front of each tied candidate's name. Apps Script
  treats a leading "=" in `setValues` as a formula, and a space between two
  names is the intersection operator in Sheets — so both names rendered as
  #REF! on the one tab everybody actually reads, for the one result the whole
  pipeline is most careful to report honestly. Every test above passed while it
  was broken: the arithmetic was right, the drawing was not.

  So the tab is drawn here, over a real tie, and every cell it writes is
  checked. A cell may only begin with "=" if it is genuinely a formula.
*/
console.log('\nthe dashboard, drawn');

const written: unknown[][] = [];
sandbox.__captureRow = (row: unknown[]) => written.push(row);

runInContext(
  `
  var __range = {
    setValues: function (rows) {
      for (var i = 0; i < rows.length; i += 1) __captureRow(rows[i]);
      return __range;
    },
    setFontColors: function () { return __range; },
    setFontWeights: function () { return __range; },
    setFontSizes: function () { return __range; },
    setVerticalAlignment: function () { return __range; },
    setHorizontalAlignment: function () { return __range; },
    setNumberFormat: function () { return __range; },
    setBorder: function () { return __range; },
  };
  var __tab = {
    clear: function () {}, getRange: function () { return __range; },
    getLastRow: function () { return BALLOT_ROWS.length + 1; },
    setColumnWidth: function () {}, setHiddenGridlines: function () {},
    setFrozenRows: function () {},
  };
  sheet_ = function () { return __tab; };
  book_ = function () {
    return { getSheetByName: function () { return __tab; }, insertSheet: function () { return __tab; } };
  };
  roll_ = function () {
    return { a: { id: 'a', name: 'A', email: 'a@x', type: 'student', house: '' } };
  };
  votedSet_ = function () { return { a: true }; };
`,
  context,
);

// An exact tie, so the tie branch is the one that draws.
const presidents = config.candidates.filter((c) => c.positionId === 'president');
BALLOT_ROWS = [];
for (const candidate of presidents.slice(0, 2)) {
  for (let i = 0; i < 8; i += 1) {
    BALLOT_ROWS.push([`b${i}`, config.election.id, 'student', 'h', 'president', candidate.id, 'd']);
  }
}
sandbox.BALLOT_ROWS = BALLOT_ROWS;

runInContext('renderDashboard(true)', context);

const cells = written.flat().filter((v): v is string => typeof v === 'string');
const formulas = cells.filter((v) => v.charAt(0) === '=' && !v.startsWith('=SPARKLINE('));
check(
  formulas.length === 0,
  'no cell is accidentally a formula',
  `found: ${formulas.slice(0, 3).join(' | ')}`,
);

const tiedNames = presidents.slice(0, 2).map((c) => c.name);
check(
  tiedNames.every((name) => cells.some((cell) => cell.indexOf(name) !== -1)),
  'both tied candidates are named on the tab',
  `looking for: ${tiedNames.join(', ')}`,
);
check(
  cells.some((cell) => cell.indexOf('TIED') === 0),
  'the contest is reported as a tie, with no winner',
);

console.log(
  failures === 0
    ? '\n  The Apps Script agrees with the domain core.\n'
    : `\n  ${failures} disagreement(s). The hosted ballot would compute a different result.\n`,
);
process.exit(failures === 0 ? 0 : 1);
