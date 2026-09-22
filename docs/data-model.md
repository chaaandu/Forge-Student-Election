# Data model — Mesa Elections

Three distinct data surfaces, deliberately shaped differently:

1. **Configuration** (`election.config.json`) — declarative, versioned, validated on load.
2. **Authoritative store** (SQLite) — what actually happened. Append-mostly, constrained.
3. **Excel workbook** (Microsoft Graph) — a downstream mirror for the school's existing
   processes. Never read back as truth.

## 1. Configuration

Validated by `packages/election-core/src/config.ts` (Zod). The server refuses to start on an
invalid configuration — a half-valid election is worse than no election.

```jsonc
{
  "election": {
    "id": "mesa-2026",
    "name": "Mesa Student Elections 2026",
    "status": "open",                  // draft | open | closed
    "opensAt": "2026-03-04T09:00:00+05:30",   // optional; enforced server-side
    "closesAt": "2026-03-04T17:00:00+05:30",
    "weights": { "student": 0.75, "employee": 0.25 },
    "zeroTurnoutPolicy": "renormalise" // renormalise | treat-as-zero  (voting-logic.md §6.1)
  },
  "houses": [
    { "id": "aravalli", "name": "Aravalli", "color": "#E4572E", "motto": "…" }
  ],
  "positions": [
    { "id": "president", "title": "President", "order": 1, "kind": "leadership",
      "eligibility": { "voterTypes": ["student", "employee"] } },
    { "id": "house-captain-aravalli", "title": "Aravalli House Captain", "order": 7,
      "kind": "house-captain", "houseId": "aravalli",
      "eligibility": { "voterTypes": ["student"], "houseId": "aravalli" } }
  ],
  "candidates": [
    { "id": "cand-001", "name": "…", "positionId": "president",
      "tagline": "…", "photoUrl": "/candidates/cand-001.jpg", "active": true }
  ]
}
```

The **voter roll** is loaded separately (`voters.json`, or from the Excel `Voters` table) and
never shipped to the browser as a whole — see [security-model.md §4](./security-model.md).

### 1.1 Validation rules enforced at load

| Rule | Why |
| --- | --- |
| `weights` values in [0,1] and sum to 1 ± 1e-9 | the business rule is meaningless otherwise |
| `voterTypes` non-empty and unique per position | an electorate of nobody is a configuration bug |
| position / candidate / house / voter ids unique | silent overwrite otherwise |
| voter emails unique, case-insensitive | email is the Entra join key |
| every `candidate.positionId` resolves | orphan candidates cannot be voted for but would appear |
| every position has ≥ 1 active candidate | an unwinnable gate blocks every voter |
| `kind: "house-captain"` ⟹ `houseId` set and resolves | otherwise nobody is eligible |
| `eligibility.houseId` resolves to a declared house | same |
| every student voter has a `houseId` that resolves | otherwise they silently lose their captain vote |
| every voter is eligible for ≥ 1 position | a voter who can vote for nothing is a roll error |
| `order` unique across positions | the sequence must be deterministic |
| `photoUrl` is a root-relative path or https URL | blocks `javascript:` and mixed content |

## 2. Authoritative schema (SQLite, WAL)

Full DDL: `apps/server/src/db/schema.sql`.

### 2.1 Attributable records — "did this person vote?"

```sql
CREATE TABLE voters (
  id            TEXT PRIMARY KEY,
  election_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  email_norm    TEXT NOT NULL,             -- lowercased; the Entra join key
  type          TEXT NOT NULL CHECK (type IN ('student','employee')),
  house_id      TEXT,
  access_code_hash TEXT,                   -- scrypt; NULL when not using code auth
  access_code_salt TEXT,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  has_voted     INTEGER NOT NULL DEFAULT 0 CHECK (has_voted IN (0,1)),
  voted_at      TEXT,
  UNIQUE (election_id, email_norm)
);

CREATE TABLE vote_receipts (                -- hard uniqueness, independent of has_voted
  voter_id    TEXT PRIMARY KEY REFERENCES voters(id),
  election_id TEXT NOT NULL,
  receipt_id  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);
```

`vote_receipts.receipt_id` is a random token proving *that* a ballot was cast. It is
**not** linked to the ballot and is not displayed to the voter (shared kiosk).

### 2.2 Anonymous records — "what did the electorate choose?"

```sql
CREATE TABLE ballots (
  id             TEXT PRIMARY KEY,          -- UUIDv4, random: not a sequence
  election_id    TEXT NOT NULL,
  voter_type     TEXT NOT NULL CHECK (voter_type IN ('student','employee')),
  submitted_hour TEXT NOT NULL,             -- '2026-03-04T11:00Z' — coarsened on purpose
  config_version TEXT NOT NULL              -- which configuration this was cast under
);

CREATE TABLE ballot_selections (
  ballot_id    TEXT NOT NULL REFERENCES ballots(id),
  position_id  TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  PRIMARY KEY (ballot_id, position_id)      -- one selection per position, structurally
);
```

**There is no `voter_id` column in either table and there never will be.** The
"who voted for whom" query is not forbidden by policy; it is unwritable.

Note what is *absent*: no `house_id` on `ballots`. It is not needed — the house is implied
by `position_id` — and storing it would shrink each ballot's anonymity set from "all
students" to "the ~30 students in that house".

An employee ballot simply has no house rows. There are **no NULL placeholders**, so an
absent house selection can never be misread as an abstention: the row does not exist because
the contest did not exist for that voter.

### 2.3 Immutability

```sql
CREATE TRIGGER ballots_no_update BEFORE UPDATE ON ballots
  BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;
CREATE TRIGGER ballots_no_delete BEFORE DELETE ON ballots
  BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;
```

The same pair exists on `ballot_selections`, `audit_log`, and `vote_receipts`. Accidental
deletion by a future migration or a stray admin script aborts at the database. (An operator
with file access can still drop the triggers — this defends against mistakes, not against a
determined administrator; see [security-model.md §8](./security-model.md#8-what-is-not-protected).)

### 2.4 Sessions, idempotency, outbox, audit

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256; the raw token is never stored
  voter_id    TEXT NOT NULL REFERENCES voters(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  ip_hash     TEXT,
  user_agent_hash TEXT
);

CREATE TABLE idempotency_keys (
  key            TEXT PRIMARY KEY,
  voter_id       TEXT NOT NULL,
  request_hash   TEXT NOT NULL,       -- detects key reuse with a different body
  status         TEXT NOT NULL CHECK (status IN ('in_flight','completed')),
  response_code  INTEGER,
  response_body  TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,        -- participation | ballot | results_snapshot
  dedupe_key    TEXT NOT NULL UNIQUE, -- stable across retries; written into the workbook
  payload       TEXT NOT NULL,        -- JSON
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|in_flight|synced|failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  synced_at     TEXT
);

CREATE TABLE audit_log (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  event       TEXT NOT NULL,
  actor_type  TEXT NOT NULL,          -- voter | admin | system
  actor_id    TEXT,
  subject_id  TEXT,
  metadata    TEXT,                   -- JSON; NEVER ballot selections, NEVER secrets
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL           -- sha256(prev_hash ‖ canonical(row))
);
```

The audit log is a **hash chain**: each row commits to its predecessor, so removing or
editing any historical row invalidates every hash after it.
`GET /api/admin/audit/verify` walks the chain and reports the first break.

### 2.5 Indexes

`ballot_selections(position_id, candidate_id)` for tallies · `ballots(voter_type)` ·
`outbox(status, next_attempt_at)` for the worker claim · `sessions(token_hash)` unique ·
`voters(election_id, email_norm)` unique.

## 3. Aggregation query

Results never touch individual ballots:

```sql
SELECT s.position_id, s.candidate_id, b.voter_type, COUNT(*) AS votes
FROM ballot_selections s
JOIN ballots b ON b.id = s.ballot_id
WHERE b.election_id = ?
GROUP BY s.position_id, s.candidate_id, b.voter_type;
```

This produces the `Tally[]` handed to the pure `calculateResults()`. Turnout comes from a
separate count over `voters`, so the two never need to be joined.

## 4. Lifecycle of one vote

```
config load ─▶ voter row (has_voted=0)
                  │  check-in
                  ▼
              session row ──▶ POST /api/ballots ──┬─▶ ballots + ballot_selections (anonymous)
                                                  ├─▶ vote_receipts + voters.has_voted=1
                                                  ├─▶ outbox × 2
                                                  ├─▶ audit_log
                                                  └─▶ idempotency_keys
                                         one transaction, all or nothing
                  ▼
           SyncWorker ──▶ Excel Voters + Ballots tables
                  ▼
           ResultsService ──▶ Excel Results table (on demand, admin)
```

## 5. Data retention

| Data | Retained | Rationale |
| --- | --- | --- |
| Ballots & selections | indefinitely (the result) | must be re-countable |
| `voters.has_voted / voted_at` | indefinitely | participation is a public fact in an election |
| `access_code_hash` | purged at close (`npm run db:reset -- --codes`) | no reason to keep credentials |
| Sessions | purged 24 h after expiry | reduces linkage surface |
| Idempotency keys | purged 7 days after the election | operational only |
| Audit log | indefinitely | tamper evidence |
| `ip_hash`, `user_agent_hash` | with the audit log; salted, never raw | abuse investigation without storing PII |

## 6. Extending the model

- **New position** → one entry in `positions`, one per candidate. No code change.
- **New voter type** (e.g. `alumni`) → add to the `VoterType` union, add a weight, list it in
  the relevant positions' `voterTypes`. Weight renormalisation (voting-logic.md §6) already
  handles three groups; the `CHECK` constraints and one Zod enum are the only edits.
- **New house** → one entry in `houses`, one house-captain position, students get the id.
- **Different storage** → implement `ElectionRepository`; the services depend on the
  interface, not on SQLite.

## 7. Results spreadsheet shape

Four tabs in one spreadsheet. **Column names go in row 1 of each tab**; the server reads them
at runtime rather than assuming an order, so whoever owns the sheet can reorder or rename
columns without values silently landing in the wrong place.

Identical for Google Sheets (what Mesa uses) and Excel via Graph — `SpreadsheetRepository` is
the only module that knows this shape.

**`Voters`** — `voter_id · name · email · type · house · has_voted · voted_at`
Updated when a voter casts a ballot. Attributable by design: who voted is not secret.

**`Candidates`** — `candidate_id · name · position · house · photo_url · active`
Pushed from configuration; a mirror for the school's own reporting.

**`Ballots`** — `ballot_id · election_id · voter_type · submitted_hour · position_id · candidate_id · dedupe_key`
One row per *selection* (flat, because Excel tables are flat and positions vary per voter).
No voter reference, matching the authoritative schema. `dedupe_key` lets the reconciliation
report detect at-least-once duplicates.

**`Results`** — `position · weighting_applied · candidate · student_votes · student_pct ·
student_contribution · employee_votes · employee_pct · employee_contribution ·
weighted_score · rank · tied`
Written on demand by `ResultsService`. `weighting_applied` carries the label from
voting-logic.md §6 so a reader of the spreadsheet can see *"Student-only (100%)"* next to
house captain rows and never mistakes the 75/25 rule for having been applied.

These shapes are not assumed permanent. `SpreadsheetRepository` is the only module that knows
them; everything upstream passes domain objects.

**Google Sheets access:** an API key can only *read* public sheets. Writing requires a
**service account** — create one in Google Cloud, enable the Sheets API, download the JSON
key, and share the spreadsheet with the service account's email address (Editor). Access can
then be revoked from the sheet's own sharing dialog, like any other collaborator.
