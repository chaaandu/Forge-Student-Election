#!/usr/bin/env node
/**
 * Google Sheets set-up and health check.
 *
 *   npm run sheets:check   — verify credentials and access, and say exactly
 *                            what is wrong if they are not right
 *   npm run sheets:setup   — create every tab, its header row, formatting and a
 *                            Dashboard of live formulas; seed the roll and the
 *                            candidate list
 *
 * Both are safe to run repeatedly. Setup never deletes a tab and never
 * overwrites rows the election has already written — it only adds what is
 * missing and rewrites header rows and the Dashboard.
 *
 * Why a service account and not an API key: an API key can only READ public
 * sheets. Writing needs an account the spreadsheet is shared with.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: 'apps/server/.env' });
loadDotenv();

const MODE = process.argv[2] ?? 'check';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

const TABS = {
  roll: process.env.SHEETS_TAB_ROLL ?? 'Roll',
  voters: process.env.SHEETS_TAB_VOTERS ?? 'Voters',
  candidates: process.env.SHEETS_TAB_CANDIDATES ?? 'Candidates',
  ballots: process.env.SHEETS_TAB_BALLOTS ?? 'Ballots',
  results: process.env.SHEETS_TAB_RESULTS ?? 'Results',
  dashboard: process.env.SHEETS_TAB_DASHBOARD ?? 'Dashboard',
};

/** Header rows. These must match what the server writes, or values land in the wrong columns. */
const HEADERS = {
  [TABS.roll]: ['voter_id', 'name', 'email', 'type', 'house'],
  [TABS.voters]: ['voter_id', 'name', 'email', 'type', 'house', 'has_voted', 'voted_at'],
  [TABS.candidates]: ['candidate_id', 'name', 'position', 'house', 'photo_url', 'active'],
  [TABS.ballots]: [
    'ballot_id', 'election_id', 'voter_type', 'submitted_hour',
    'position_id', 'candidate_id', 'dedupe_key',
  ],
  [TABS.results]: [
    'position', 'weighting_applied', 'candidate',
    'student_votes', 'student_percentage', 'student_contribution',
    'employee_votes', 'employee_percentage', 'employee_contribution',
    'weighted_score', 'rank', 'tied', 'generated_at',
  ],
};

const fail = (lines) => {
  console.error(`\n✗ ${lines.join('\n  ')}\n`);
  process.exit(1);
};

// ------------------------------------------------------------ credentials ---
function serviceAccount() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim();
  const raw = inline || (file ? readFileSync(file, 'utf8') : '');

  if (!raw) {
    fail([
      'No Google credentials found.',
      '',
      'Set one of these in apps/server/.env :',
      '  GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/absolute/path/to/key.json   (easiest)',
      '  GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"…","private_key":"…"}',
      '',
      'An API key will NOT work — it can only read public sheets, not write.',
    ]);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(['The credentials are not valid JSON. Paste the key file exactly as downloaded.']);
  }
  if (!parsed.client_email || !parsed.private_key) {
    fail(['The key file is missing client_email or private_key.']);
  }
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  let signature;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    signature = signer.sign(sa.private_key, 'base64url');
  } catch {
    fail(['Could not sign with the private key. Copy it whole, including the BEGIN/END lines.']);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!res.ok) {
    fail([
      `Google refused the credentials (${res.status}).`,
      'Check the key is current and that the Google Sheets API is enabled for its project:',
      '  https://console.cloud.google.com/apis/library/sheets.googleapis.com',
    ]);
  }
  return (await res.json()).access_token;
}

// -------------------------------------------------------------------- API ---
let TOKEN = '';
const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID?.trim();

async function api(path, init = {}) {
  const res = await fetch(`${SHEETS}/${spreadsheetId}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  });

  if (res.status === 403) {
    // A 403 has several quite different causes and they need different fixes.
    // Read Google's own reason rather than guessing — an earlier version always
    // said "share the sheet", which sent someone to re-do a step they had
    // already done correctly.
    const body = await res.clone().json().catch(() => ({}));
    const reason = body?.error?.details?.[0]?.reason;
    const detail = body?.error?.details?.[0]?.metadata ?? {};

    if (reason === 'SERVICE_DISABLED') {
      fail([
        'The Google Sheets API is not enabled on this Cloud project yet.',
        '',
        'The sheet IS shared correctly — this is the other half of step 2.',
        '',
        'Open this and press ENABLE:',
        `  ${detail.activationUrl ?? 'https://console.cloud.google.com/apis/library/sheets.googleapis.com'}`,
        '',
        'Then wait about a minute and run this again.',
      ]);
    }

    const sa = serviceAccount();
    fail([
      'Google returned 403 — the service account cannot open this spreadsheet.',
      '',
      'Open the sheet → Share → paste this address → give it Editor:',
      `  ${sa.client_email}`,
      '',
      `Google said: ${body?.error?.message ?? '(no detail)'}`,
    ]);
  }
  if (res.status === 404) {
    fail([
      `Google returned 404 for spreadsheet ${spreadsheetId}.`,
      'Check SHEETS_SPREADSHEET_ID. It is the part of the URL between /d/ and /edit:',
      '  https://docs.google.com/spreadsheets/d/THIS_PART/edit',
    ]);
  }
  if (!res.ok) fail([`Google Sheets returned ${res.status} for ${path}`, await res.text()]);
  return res.json();
}

const batch = (requests) => api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });

const writeValues = (range, values) =>
  api(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values }),
  });

// ------------------------------------------------------------------- main ---
if (!spreadsheetId) {
  fail([
    'SHEETS_SPREADSHEET_ID is not set.',
    '',
    'Create a Google Sheet, then copy the id out of its URL:',
    '  https://docs.google.com/spreadsheets/d/THIS_PART/edit',
    'and put it in apps/server/.env as SHEETS_SPREADSHEET_ID=THIS_PART',
  ]);
}

const sa = serviceAccount();
TOKEN = await accessToken(sa);
const sheet = await api('?fields=properties.title,sheets.properties');
const existing = new Map(sheet.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

console.log(`\n  Spreadsheet : ${sheet.properties.title}`);
console.log(`  Writing as  : ${sa.client_email}`);
console.log(`  Tabs found  : ${[...existing.keys()].join(', ') || '(none)'}\n`);

if (MODE === 'check') {
  const missing = Object.values(TABS).filter((t) => !existing.has(t));
  if (missing.length > 0) {
    console.log(`  Missing tabs: ${missing.join(', ')}`);
    console.log('  Run  npm run sheets:setup  to create them.\n');
  } else {
    console.log('  ✓ Every tab is present. Results will flow here.\n');
  }
  process.exit(0);
}

// ------------------------------------------------------------------ setup ---
const config = JSON.parse(readFileSync('apps/server/config/election.config.json', 'utf8'));
const roll = JSON.parse(readFileSync('apps/server/config/voters.json', 'utf8'));
const houses = Object.fromEntries(config.houses.map((h) => [h.id, h.name]));

// 1 ── create any tab that does not exist yet
const toCreate = Object.values(TABS).filter((t) => !existing.has(t));
if (toCreate.length > 0) {
  const created = await batch(toCreate.map((title) => ({ addSheet: { properties: { title } } })));
  for (const reply of created.replies) {
    existing.set(reply.addSheet.properties.title, reply.addSheet.properties.sheetId);
  }
  console.log(`  + created ${toCreate.join(', ')}`);
}

// 2 ── header rows, rewritten every time so they cannot drift from the server
for (const [tab, header] of Object.entries(HEADERS)) {
  await writeValues(`${tab}!A1`, [header]);
}
console.log('  + header rows written');

// 3 ── seed the tabs that do not change during the election
await writeValues(
  `${TABS.roll}!A2`,
  roll.map((v) => [v.id, v.name, v.email, v.type, houses[v.houseId] ?? '']),
);
await writeValues(
  `${TABS.candidates}!A2`,
  config.candidates.map((c) => {
    const position = config.positions.find((p) => p.id === c.positionId);
    return [c.id, c.name, position?.title ?? c.positionId, houses[position?.houseId] ?? '', c.photoUrl ?? '', c.active];
  }),
);
console.log(`  + seeded ${roll.length} voters and ${config.candidates.length} candidates`);

// 4 ── the Dashboard: live formulas over whatever the election has written
const R = TABS.results;
const houseRows = config.houses.map((h, i) => {
  const row = 16 + i;
  return [
    h.name,
    `=COUNTIF('${TABS.voters}'!E:E,$A${row})`,
    `=COUNTIF('${TABS.roll}'!E:E,$A${row})`,
    `=IF($C${row}=0,0,$B${row}/$C${row})`,
    `=IF($C${row}=0,"",REPT("█",ROUND($D${row}*24)))`,
  ];
});

await writeValues(`${TABS.dashboard}!A1`, [
  [config.election.name.toUpperCase()],
  ['Live. Everything below updates itself as votes arrive.'],
  [],
  ['TURNOUT'],
  ['Voted', `=COUNTA('${TABS.voters}'!A2:A)`],
  ['On the roll', `=COUNTA('${TABS.roll}'!A2:A)`],
  ['Turnout', '=IF($B6=0,0,$B5/$B6)'],
  [],
  ['Students', `=COUNTIF('${TABS.voters}'!D:D,"student")`, `=COUNTIF('${TABS.roll}'!D:D,"student")`, '=IF($C9=0,0,$B9/$C9)'],
  ['Employees', `=COUNTIF('${TABS.voters}'!D:D,"employee")`, `=COUNTIF('${TABS.roll}'!D:D,"employee")`, '=IF($C10=0,0,$B10/$C10)'],
  [],
  [],
  ['BY HOUSE'],
  [],
  ['House', 'Voted', 'On roll', 'Turnout', ''],
  ...houseRows,
]);

const firstResultRow = 16 + config.houses.length + 3;
await writeValues(`${TABS.dashboard}!A${firstResultRow - 2}`, [
  ['RESULTS'],
  [
    'Snapshot',
    `=IFERROR(INDEX('${R}'!M2:M,COUNTA('${R}'!M2:M)),"Not published yet — run the publish step")`,
  ],
  [],
  ['WHO IS WINNING'],
  ['Position', 'Winner', 'Weighted score', ''],
  [
    `=IFERROR(SORT(FILTER({'${R}'!A2:A,'${R}'!C2:C,'${R}'!J2:J},('${R}'!M2:M=$B${firstResultRow - 1})*('${R}'!K2:K=1)),1,TRUE),"")`,
  ],
]);

const everyRow = firstResultRow + 4 + config.positions.length + 3;
await writeValues(`${TABS.dashboard}!A${everyRow - 2}`, [
  ['EVERY CANDIDATE'],
  ['Position', 'Candidate', 'Student votes', 'Employee votes', 'Weighted score', 'Rank'],
  [
    `=IFERROR(SORT(FILTER({'${R}'!A2:A,'${R}'!C2:C,'${R}'!D2:D,'${R}'!G2:G,'${R}'!J2:J,'${R}'!K2:K},'${R}'!M2:M=$B${firstResultRow - 1}),1,TRUE,6,TRUE),"")`,
  ],
]);
console.log('  + dashboard formulas written');

// 5 ── formatting: frozen headers, bold, sensible widths, percent columns
const formatting = [];
for (const [title, id] of existing) {
  formatting.push(
    { updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    {
      repeatCell: {
        range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.95, green: 0.93, blue: 0.88 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    { autoResizeDimensions: { dimensions: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: 13 } } },
  );
  if (title === TABS.dashboard) {
    // The Dashboard has its own headings, not a header row.
    formatting.pop();
    formatting.splice(formatting.length - 2, 1);
  }
}
await batch(formatting);
console.log('  + formatting applied');

console.log(`\n✓ Ready.  https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`);
console.log('  Next:');
console.log('    1. Set SPREADSHEET_MODE=sheets in apps/server/.env and restart the server.');
console.log('    2. Votes appear in Voters and Ballots as they are cast.');
console.log('    3. Publish results whenever you want a fresh snapshot:');
console.log('         npm run results:publish');
console.log('    4. Add charts from the Dashboard ranges — see docs/google-sheets-setup.md §5.\n');
