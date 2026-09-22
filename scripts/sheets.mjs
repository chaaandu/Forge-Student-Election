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
//
// Built row by row rather than at hand-counted offsets. Every formula refers to
// rows by the variable that created them, so adding a house, a position or a
// candidate cannot quietly point a COUNTIF at the wrong cell.
const R = `'${TABS.results}'`;
const V = `'${TABS.voters}'`;
const L = `'${TABS.roll}'`;
const INK = '#141414';

// Every reference below is a WHOLE column — `M:M`, never `M2:M`.
//
// The server appends with `insertDataOption=INSERT_ROWS`, and Google adjusts
// relative references across the whole spreadsheet when rows are inserted. A
// formula written as `Results!M2:M` therefore becomes `Results!M27:M` the
// moment 25 result rows arrive, and the Dashboard quietly reads past its own
// data and reports "Not published yet" over a full set of results. A
// whole-column reference has no row part to shift.
//
// The cost is that the header row is inside every range. It is text, so it
// never satisfies a `=$A28` or `=1` condition, and the two places that count
// rows subtract it explicitly.

const houseById = new Map(config.houses.map((h) => [h.id, h]));
const inOrder = [...config.positions].sort((a, b) => a.order - b.order);

const rows = [];
/** Pushes a row and returns its 1-based row number. */
const line = (...cells) => rows.push(cells);
const gap = () => rows.push([]);
/** The row a formula is about to occupy, for the many rows that refer to themselves. */
const next = () => rows.length + 1;

const paint = [];    // coloured bar glyphs: { row, column, color }
const numbers = [];  // number formats:      { row, column, type, pattern }
const titles = [];   // section headings:    row numbers
const heads = [];    // column header rows:  row numbers

const percent = (row, column) => numbers.push({ row, column, type: 'PERCENT', pattern: '0.0%' });
// student_percentage and employee_percentage already arrive multiplied by 100,
// so they take a literal suffix rather than a percent format that would
// multiply them a second time.
const outOfHundred = (row, column) => numbers.push({ row, column, type: 'NUMBER', pattern: '0.0"%"' });

line(config.election.name.toUpperCase());
line('Live. Everything below updates itself as votes arrive.');
gap();

// ── turnout ──────────────────────────────────────────────────────────────
titles.push(line('TURNOUT'));
const rVoted = line('Voted', `=COUNTA(${V}!A:A)-1`);
const rRoll = line('On the roll', `=COUNTA(${L}!A:A)-1`);
const rRate = next();
line(
  'Turnout',
  `=IF($B${rRoll}=0,0,$B${rVoted}/$B${rRoll})`,
  `=IF($B${rRoll}=0,"",REPT("█",ROUND($B${rRate}*40)))`,
);
percent(rRate, 1);
paint.push({ row: rRate, column: 2, color: INK });

gap();
heads.push(line('', 'Voted', 'On roll', 'Turnout', ''));
for (const [label, type] of [['Students', 'student'], ['Employees', 'employee']]) {
  const r = next();
  line(
    label,
    `=COUNTIF(${V}!D:D,"${type}")`,
    `=COUNTIF(${L}!D:D,"${type}")`,
    `=IF($C${r}=0,0,$B${r}/$C${r})`,
    `=IF($C${r}=0,"",REPT("█",ROUND($D${r}*24)))`,
  );
  percent(r, 3);
  paint.push({ row: r, column: 4, color: INK });
}

// ── by house ─────────────────────────────────────────────────────────────
gap();
gap();
titles.push(line('BY HOUSE'));
gap();
heads.push(line('House', 'Voted', 'On roll', 'Turnout', ''));
for (const house of config.houses) {
  const r = next();
  line(
    house.name,
    `=COUNTIF(${V}!E:E,$A${r})`,
    `=COUNTIF(${L}!E:E,$A${r})`,
    `=IF($C${r}=0,0,$B${r}/$C${r})`,
    `=IF($C${r}=0,"",REPT("█",ROUND($D${r}*24)))`,
  );
  percent(r, 3);
  // The house's own colour, not a black block. Four lanes in four colours read
  // as a race; four lanes in black read as a table.
  paint.push({ row: r, column: 4, color: house.color });
}

// ── results ──────────────────────────────────────────────────────────────
gap();
gap();
titles.push(line('RESULTS'));
const rSnap = next();
line(
  'Snapshot',
  // Guarded with a count rather than IFERROR: on an unpublished sheet only
  // the header is there, and INDEX(range, 0) is a whole-column spill rather
  // than an error — so IFERROR never sees it and the cell reads #REF!
  // instead of saying what to do about it.
  `=IF(COUNTA(${R}!M:M)<2,"Not published yet — run: npm run results:publish",` +
    `INDEX(${R}!M:M,COUNTA(${R}!M:M)))`,
);
// Every formula below is scoped to this one timestamp, so a dashboard read
// halfway through a publish shows the previous complete count rather than a
// half-written one.
const SNAP = `$B$${rSnap}`;

gap();
titles.push(line('WHO IS WINNING'));
heads.push(line('Position', 'Winner', 'Weighted score', '', 'Status'));
for (const position of inOrder) {
  const r = next();
  const house = position.houseId ? houseById.get(position.houseId) : null;
  const top = `(${R}!A:A=$A${r})*(${R}!M:M=${SNAP})*(${R}!K:K=1)`;
  line(
    position.title,
    // Joined rather than picked: a tie has more than one name at rank 1, and
    // this sheet reports ties instead of quietly choosing between them.
    `=IFERROR(TEXTJOIN(" · ",TRUE,FILTER(${R}!C:C,${top})),"")`,
    `=IFERROR(INDEX(FILTER(${R}!J:J,${top}),1),"")`,
    `=IF($C${r}="","",REPT("█",ROUND($C${r}*30)))`,
    `=IF($B${r}="","Not published yet",` +
      `IF($C${r}=0,"No votes yet",` +
      `IF(COUNTIFS(${R}!A:A,$A${r},${R}!M:M,${SNAP},${R}!K:K,1)>1,"Tied","Leading")))`,
  );
  percent(r, 2);
  paint.push({ row: r, column: 3, color: house ? house.color : INK });
}

// ── every candidate ──────────────────────────────────────────────────────
gap();
gap();
titles.push(line('EVERY CANDIDATE'));
heads.push(line(
  'Position', 'Candidate',
  'Student votes', 'Student share', 'Employee votes', 'Employee share',
  'Weighted score', 'Rank', '',
));
for (const position of inOrder) {
  const house = position.houseId ? houseById.get(position.houseId) : null;
  for (const candidate of config.candidates.filter((c) => c.positionId === position.id)) {
    const r = next();
    // Position AND candidate: one person can stand in two contests — a house
    // captain is also eligible to stand for a leadership post — so the name
    // alone does not identify a row.
    const where = `(${R}!A:A=$A${r})*(${R}!C:C=$B${r})*(${R}!M:M=${SNAP})`;
    const pick = (column) => `=IFERROR(INDEX(FILTER(${R}!${column}:${column},${where}),1),"")`;
    line(
      position.title, candidate.name,
      pick('D'), pick('E'), pick('G'), pick('H'), pick('J'), pick('K'),
      `=IF($G${r}="","",REPT("█",ROUND($G${r}*30)))`,
    );
    outOfHundred(r, 3);
    outOfHundred(r, 5);
    percent(r, 6);
    paint.push({ row: r, column: 8, color: house ? house.color : INK });
  }
}

const dashboardId = existing.get(TABS.dashboard);

// Written whole each time, so a dashboard that grew shorter — a position
// removed, a candidate withdrawn — leaves nothing stale below it. Only the
// Dashboard is ever cleared; it holds formulas, never election data.
await api(`/values/${encodeURIComponent(`${TABS.dashboard}!A1:Z2000`)}:clear`, {
  method: 'POST',
  body: '{}',
});
await writeValues(`${TABS.dashboard}!A1`, rows);
console.log(`  + dashboard: ${inOrder.length} contests, ${config.candidates.length} candidates`);

// 5 ── formatting
const rgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};
const cell = (row, column) => ({
  sheetId: dashboardId,
  startRowIndex: row - 1,
  endRowIndex: row,
  startColumnIndex: column,
  endColumnIndex: column + 1,
});
const band = (row, columns) => ({
  sheetId: dashboardId,
  startRowIndex: row - 1,
  endRowIndex: row,
  startColumnIndex: 0,
  endColumnIndex: columns,
});

const formatting = [];

/**
 * Left-align a whole tab.
 *
 * Sheets right-aligns numbers by default, which puts every count and
 * percentage hard against the next column and a long way from the label it
 * belongs to. Applied to the columns rather than to a block of rows, so rows
 * the election appends later are aligned too — there is nobody to re-run
 * setup mid-count.
 */
const alignLeft = (sheetId, columns) => ({
  repeatCell: {
    range: { sheetId, startColumnIndex: 0, endColumnIndex: columns },
    cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
    fields: 'userEnteredFormat.horizontalAlignment',
  },
});

// The data tabs: a frozen, bold header row and columns wide enough to read.
for (const [title, id] of existing) {
  if (title === TABS.dashboard) continue;
  formatting.push(
    alignLeft(id, 13),
    {
      updateSheetProperties: {
        properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
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
    {
      autoResizeDimensions: {
        dimensions: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: 13 },
      },
    },
  );
}

// The Dashboard has its own typography: a masthead, section rules, and one
// coloured bar per row.
formatting.push(
  alignLeft(dashboardId, 9),
  {
    repeatCell: {
      range: band(1, 9),
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } },
      fields: 'userEnteredFormat.textFormat',
    },
  },
  {
    repeatCell: {
      range: band(2, 9),
      cell: {
        userEnteredFormat: {
          textFormat: { italic: true, foregroundColor: rgb('#7D766C') },
        },
      },
      fields: 'userEnteredFormat.textFormat',
    },
  },
);

for (const row of titles) {
  formatting.push({
    repeatCell: {
      range: band(row, 9),
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          backgroundColor: rgb('#141414'),
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  });
  formatting.push({
    repeatCell: {
      range: cell(row, 0),
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: rgb('#FFC20E') } } },
      fields: 'userEnteredFormat.textFormat',
    },
  });
}

for (const row of heads) {
  formatting.push({
    repeatCell: {
      range: band(row, 9),
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, foregroundColor: rgb('#514D48') },
          backgroundColor: rgb('#F2EDE1'),
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  });
}

for (const { row, column, color } of paint) {
  formatting.push({
    repeatCell: {
      range: cell(row, column),
      cell: { userEnteredFormat: { textFormat: { foregroundColor: rgb(color) } } },
      fields: 'userEnteredFormat.textFormat.foregroundColor',
    },
  });
}

for (const { row, column, type, pattern } of numbers) {
  formatting.push({
    repeatCell: {
      range: cell(row, column),
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
}

formatting.push(
  {
    updateDimensionProperties: {
      range: { sheetId: dashboardId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 210 },
      fields: 'pixelSize',
    },
  },
  {
    updateDimensionProperties: {
      range: { sheetId: dashboardId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
      properties: { pixelSize: 210 },
      fields: 'pixelSize',
    },
  },
  {
    updateDimensionProperties: {
      range: { sheetId: dashboardId, dimension: 'COLUMNS', startIndex: 2, endIndex: 9 },
      properties: { pixelSize: 130 },
      fields: 'pixelSize',
    },
  },
);

await batch(formatting);
console.log('  + formatting applied');

console.log(`\n✓ Ready.  https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`);
console.log('  Next:');
console.log('    1. Set SPREADSHEET_MODE=sheets in apps/server/.env and restart the server.');
console.log('    2. Votes appear in Voters and Ballots as they are cast.');
console.log('    3. Publish results whenever you want a fresh snapshot:');
console.log('         npm run results:publish');
console.log('    4. The Dashboard reads on its own; for Google charts over the same');
console.log('       ranges see docs/google-sheets-setup.md §6.\n');
