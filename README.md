# Mesa Elections

A student and employee election system for Mesa School of Business, presented as
a departure board. Students vote for six leadership positions plus their own
house captain; employees vote for the six leadership positions. Results combine
the two electorates with configured weights (75% student / 25% employee) that are
resolved **per position**, so house captain contests are scored student-only at
100% rather than capped at 75%.

Built to be run in a hall on shared kiosks, and built so the interesting part —
one person, one vote — is provable rather than hoped for.

Voting runs **supervised**: students come to a booth in one room with a Mesa employee
present, pick their name, and vote. Identity is established by that person — as it is at a
polling station. The software still guarantees one ballot per voter absolutely, and the
invigilator gets a live `/monitor` view of who has voted. Results mirror to **Google
Sheets**.

```
277 tests · lint clean · typecheck clean · production build clean
```

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Commands](#commands)
- [Environment variables](#environment-variables)
- [Election configuration](#election-configuration)
- [Authentication modes](#authentication-modes)
- [The invigilator monitor](#the-invigilator-monitor)
- [Google Sheets integration](#google-sheets-integration)
- [Results and weighting](#results-and-weighting)
- [Security](#security)
- [Testing](#testing)
- [Production build and deployment](#production-build-and-deployment)
- [Resetting development data](#resetting-development-data)
- [Documentation](#documentation)

---

## What it does

The voter journey — welcome → check-in → identity confirmation → one gate per
position → review → final call → submission → thank-you → reset — is a
deterministic state machine whose steps are derived from the positions **that
voter** is eligible for. An employee's journey runs from Community Lead straight
to Review; the House Captains step is not hidden or disabled for them, it is not
in their sequence at all, and their progress reads `6 / 6`.

That behaviour is not a branch in the code. Every position declares its own
electorate:

```jsonc
{ "id": "president",              "eligibility": { "voterTypes": ["student", "employee"] } },
{ "id": "house-captain-aravalli", "eligibility": { "voterTypes": ["student"],
                                                   "houseId": "aravalli" } }
```

and the step engine, progress indicator, review screen, ballot validation (client
*and* server), turnout, and per-position weighting all derive from that one
field. `npm run check:branching` fails the build if election logic starts
branching on voter type instead.

## Architecture

```
apps/web            React 19 + Vite + Tailwind 4. Presentation and flow only.
  └─ machine/       the voting state machine (no election rules)
apps/server         Express 5 + SQLite (WAL). The only authority.
  ├─ services/      VotingService · ResultsService · SyncWorker · SessionService
  ├─ identity/      Entra ID · access codes · dev (refuses to load in production)
  ├─ excel/         ExcelRepository port → Graph or local JSONL spool
  └─ db/            schema, repositories, hash-chained audit log
packages/election-core   Pure domain logic. One dependency (zod), no I/O.
                         Config schema · eligibility · ballot validation · weighting.
```

Strictly one-directional: nothing below knows about anything above. `election-core`
is imported by both the browser and the server — the browser for instant feedback,
the server as the only answer that counts. Full detail and the architecture
decision records are in [`docs/architecture.md`](docs/architecture.md).

**The critical path.** Recording a ballot is one `BEGIN IMMEDIATE` transaction
containing: idempotency check, election-window check, re-read of the voter,
server-side validation against the voter record *the server loaded*, the anonymous
ballot, the participation mark, the Excel outbox rows, and the audit entry. There
is no state in which a ballot exists but the voter is not marked as having voted.
Three independent mechanisms prevent a second ballot; the load-bearing one is a
compare-and-swap (`UPDATE … WHERE has_voted = 0`) whose row count is asserted.
This is proved by a test that spawns eight real OS processes contending for the
same database file.

## Local setup

Requires **Node 22+** (developed on 24) and npm 10+.

```bash
git clone <repo> && cd "Student Voting System"
npm install
npm approve-scripts better-sqlite3 esbuild   # npm 11+ gates native builds

cp .env.example .env                          # defaults are fine for development
npm run seed                                  # loads the demo election into SQLite
npm run dev                                   # API on :8787, web on :5173
```

Open **http://localhost:5173** to vote, and **http://localhost:8787/monitor** for the
invigilator view (admin token `dev-admin-token` locally).

The demo election ships 118 students across 4 houses, 10 employees, 10 positions and 30
candidates, all marked `isSeedData: true` — which puts a red banner on the voting screen
and makes the server refuse to start in production until it is replaced with the real roll.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` | builds core → server → web |
| `npm test` | all 244 tests (core, server, web) |
| `npm run test:watch` | watch mode |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint (includes the React hooks rule set) |
| `npm run verify` | lint + integrity checks + typecheck + tests + build |
| `npm run preflight` | `verify` **and** the no-seed-data check. Run before an election. |
| `npm run seed` | load the configured election and roll into the database |
| `npm run seed -w @mesa/server -- --codes` | also issue one-time access codes (only needed for `AUTH_MODE=access-code`) |
| `npm run db:reset` | delete the database (refuses in production without `--i-understand`) |
| `npm run gen:secrets` | print a ready-to-paste block of fresh secrets |
| `npm run check:branching` | fail if election logic branches on voter type |
| `npm run check:client-secrets` | fail if a server secret is referenced from the web app |
| `npm run verify:no-seed` | fail if demo candidates or `@seed.invalid` voters are configured |

## Environment variables

Full annotated list in [`.env.example`](.env.example). Only `VITE_`-prefixed
variables reach the browser; `npm run check:client-secrets` enforces it.

| Variable | Notes |
| --- | --- |
| `AUTH_MODE` | `supervised` \| `access-code` \| `entra`. Mesa uses `supervised`. |
| `SPREADSHEET_MODE` | `sheets` \| `excel` \| `spool`. **Production refuses `spool`.** |
| `SHEETS_SPREADSHEET_ID` | the id from the sheet URL. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole downloaded key file, as one value. Never commit it. |
| `ADMIN_API_TOKEN` | bearer token for `/api/admin/*` **and the `/monitor` page**. ≥32 chars and non-placeholder in production. |
| `KIOSK_TOKEN` / `VITE_KIOSK_TOKEN` | device credential gating roll *search*. Must match. Casts no votes. |
| `ACCESS_CODE_PEPPER` | global pepper for access-code hashes. Rotating it invalidates every issued code. |
| `HASH_SALT` | salts IP and user-agent hashes in the audit log so abuse is investigable without storing PII. |
| `MICROSOFT_*` | Entra app registration. Required when `AUTH_MODE=entra`. |
| `EXCEL_*` | Graph credentials and workbook/table ids. Required when `SPREADSHEET_MODE=excel`. |
| `SYNC_*` | outbox worker interval, batch size, max attempts. |
| `ELECTION_CONFIG_PATH` / `VOTER_ROLL_PATH` | the election and the roll. Validated at boot; invalid config = refuse to start. |

Generate every secret at once with `npm run gen:secrets`. Never commit `.env`.

## Election configuration

Nothing about this election is in the code. `apps/server/config/election.config.json`
defines the election, weights, houses, positions and candidates;
`apps/server/config/voters.json` is the roll. Both are validated by a Zod schema
that rejects, among other things: weights that do not sum to 1, a position with
no eligible voter types, a position with no active candidates, an orphan
candidate, a house-captain position with no house scope, a student with no house,
a voter eligible for nothing, duplicate emails, and a `javascript:` photo URL.
Every problem is reported at once, not just the first.

Running next year's election means editing these two files. See
[`docs/data-model.md §1`](docs/data-model.md) for every rule and
[`docs/data-model.md §6`](docs/data-model.md) for how to add a position, a house,
or a third voter type.

## Authentication modes

Selecting a name in the UI is **navigation, not authentication**. Whatever the mode, the
session token issued afterwards is what the ballot endpoint trusts, and it carries the voter
id server-side — the client never sends a voter id the server believes.

### `supervised` — what Mesa uses

The voter selects their own name at a booth. No credential is presented, because a Mesa
employee is in the room and knows who is in front of them. This is a deliberate operating
decision, and the honest accounting is:

**Still guaranteed, entirely in software:** one ballot per voter ever; no ballot for someone
already marked as voted; a ballot containing positions the voter isn't eligible for rejected
whole; every check-in and ballot in a tamper-evident audit log.

**Not guaranteed:** that the person at the booth is who they selected. A student could pick
an absent classmate's name. The invigilator carries that, backed by three things the software
does provide — the confirmation screen sets the name large enough to read across a booth,
roll search visibly marks names that have already voted, and `/monitor` gives a live
reconciliation of the room.

**Use something else if** the election isn't physically supervised, or the invigilator
doesn't know the electorate by sight. `AUTH_MODE=access-code` (printed 6-character slips
handed over against student ID, scrypt-hashed, 5 attempts then a lockout) and
`AUTH_MODE=entra` (Microsoft sign-in) are both fully implemented and tested. It's a one-line
change.

## The invigilator monitor

```
http://<host>/monitor
```

A self-contained page served by the API — deliberately **not** part of the voting SPA, so it
can't be reached from a booth by navigating the voter flow. Enter the admin token once; it
stays in that tab only.

Shows live, refreshing every 3 seconds: turnout overall, by voter type and by house; and the
full roll with who has voted and when. Search by name, or filter to **Not yet voted** to
chase the stragglers near closing.

It reports **participation only**. No query in this system can reveal how a person voted, and
this endpoint is not an exception.

## Google Sheets integration

The spreadsheet is a **downstream mirror, never the source of truth**.

```
ballot transaction ──▶ outbox (same transaction, so enqueue is atomic with the vote)
                          │
                 SyncWorker ──▶ Google Sheets
                          ├─ transient failure (429/5xx) → exponential backoff + jitter
                          ├─ permanent failure (403/404) → dead-letter, surfaced on /sync/status
                          └─ never deletes the row; the vote is already durable
```

A vote is recorded the moment the local transaction commits, and that is when the voter is
told so. If Google is unreachable for the entire election, results are still complete and
exportable; the sync drains afterwards.

### Setting it up

> **An API key will not work.** API keys can only *read* public sheets. Writing needs a
> service account. Same effort, actually works.

1. [Google Cloud console](https://console.cloud.google.com) → create/pick a project →
   **enable the Google Sheets API**.
2. **Service accounts** → create one → **Keys → Add key → JSON** → download it.
3. Open the downloaded file and copy the `client_email`
   (`something@project.iam.gserviceaccount.com`).
4. Open your spreadsheet → **Share** → paste that email → give it **Editor**.
5. Create four tabs — `Voters`, `Candidates`, `Ballots`, `Results` — and put the column names
   in **row 1** of each (shapes in [`docs/data-model.md §7`](docs/data-model.md)). Column
   order is read at runtime, so you can rearrange them freely.
6. Set `SPREADSHEET_MODE=sheets`, `SHEETS_SPREADSHEET_ID` (the id from the sheet URL), and
   paste the whole key file into `GOOGLE_SERVICE_ACCOUNT_JSON`.
7. Check `/api/admin/sync/status` — a 403 there tells you exactly which email to share with.

`SPREADSHEET_MODE=spool` (the default in development) runs the identical sync path but writes
JSONL to `.excel-spool/`, so the first time this runs against a real sheet is not the first
time it runs at all. **Production refuses to start with `spool`** — the most plausible go-live
mistake is everything appearing to work while nothing reaches the spreadsheet.

`SPREADSHEET_MODE=excel` keeps the Microsoft 365 / Graph implementation available.

## Results and weighting

Results are never exposed to voters and require the admin token.

```
GET  /api/admin/results           full weighted results, per position
GET  /api/admin/results.csv       the same, flattened
POST /api/admin/results/publish   queue a snapshot to the workbook
GET  /api/admin/turnout           by voter type
GET  /api/admin/audit/verify      walk the audit hash chain
GET  /api/admin/sync/status       outbox depth and spreadsheet health
GET  /api/admin/monitor           who has voted (participation only, never choices)
GET  /monitor                     the invigilator page that renders it
```

For each position, each eligible voter type is normalised **independently** and
then weighted:

```
share(c,t)  = votes(c,t) / totalVotes(position, t)      0 if that group cast nothing
final(c)    = Σ_t share(c,t) × effectiveWeight(position, t)
```

No group size appears anywhere in the code — denominators are counted from the
votes actually cast, so the arithmetic is identical for 118 students or 1,180.

Effective weights are resolved per position from its eligibility: when only one
group is eligible, that group carries 1.0. Every result row is labelled with the
rule that was applied (`Weighted 75/25 (student/employee)` vs
`Student-only (100%)`), so a reader of the spreadsheet can never mistake one for
the other.

> **One governance decision needs your confirmation.** When a group is *eligible
> but casts zero votes*, the default `zeroTurnoutPolicy: "renormalise"` drops it
> and renormalises, so scores stay on a 0–100% scale. The alternative,
> `"treat-as-zero"`, retains the weight and caps the attainable score at 75%.
> **The ranking and the winner are identical either way** — it is a presentation
> choice, not an outcome choice — but the published percentages differ. Both are
> implemented and tested; switching is one config field. Rationale in
> [`docs/voting-logic.md §6.1`](docs/voting-logic.md).

## Security

[`docs/security-model.md`](docs/security-model.md) maps twenty threats to the
specific control and test that addresses each, and — just as importantly — states
what is *not* protected. Headlines:

- **One vote per voter**, enforced by a serialised transaction with a
  compare-and-swap, a primary key on `vote_receipts`, and a precondition check.
  Proved with eight concurrent OS processes.
- **Idempotency**: one key per ballot, reused on every retry. A repeated key
  replays the original response; a *new* key from a voter who has already voted
  is still rejected — idempotency de-duplicates retries, it is not what enforces
  one-vote.
- **Ballot secrecy by schema shape**: there is no `voter_id` column on `ballots`
  or `ballot_selections`, so the "who voted for whom" query is unwritable rather
  than merely forbidden. Ballot timestamps are hour-bucketed and ids are random.
- **The request body cannot influence identity**: `voterId` and `voterType` are
  not in the submission schema at all. A forged value has nowhere to land.
- **Tamper-evident audit log**: append-only, hash-chained, with database triggers
  that abort updates and deletes on ballots, selections, receipts and the log.
  Ballot selections and secrets are never written to it — the repository *throws*
  if you try.
- **Rate limits keyed for a shared kiosk**: per-voter, not per-IP, because a hall
  is one NAT address with a queue behind it. An IP-keyed limit would throttle the
  election itself — it did, in testing, before this was fixed.

Honest limits, stated in full in §8 of that document: an operator with file
access can read the database and correlate insertion order with `voted_at`;
coerced voting is not solvable here; Excel delivery is at-least-once; rate-limit
state is per-process.

Before an election, work through the checklist in
[`docs/security-model.md §10`](docs/security-model.md) and run `npm run preflight`.

## Testing

```bash
npm test                              # everything
npx vitest run --project core         # domain logic only
npx vitest run --project server       # API, persistence, concurrency, sync
npx vitest run --project web          # machine, components, full journeys
```

| Suite | Covers |
| --- | --- |
| `core` (77) | weighting including both zero-turnout policies, ties, unknown candidates, config validation, eligibility, step sequences, ballot validation |
| `server` (133) | one-vote enforcement, **eight-process concurrency**, idempotency, forged payloads, roll masking, admin authz, audit chain tampering, immutability triggers, Google Sheets auth/errors/header-ordering, spreadsheet failure/throttle/recovery, the invigilator monitor, end-to-end weighted results, shared-kiosk rate limits |
| `web` (67) | the state machine, the split-flap accessibility contract, token contrast ratios, and full student and employee journeys through the real UI |

Tests that matter most: `concurrency.test.ts` (eight OS processes, one ballot),
`flow.test.tsx` → *"NEVER shows success before the server responds"*, and
`results.test.ts` → *"applies student-only weighting to house captains,
uncapped"*.

## Production build and deployment

```bash
npm run preflight        # verify + refuse demo data
npm run build
NODE_ENV=production node apps/server/dist/main.js
```

In production the API serves the built SPA from the same origin, so a deployment
is one Node process and one mounted volume for `DATABASE_PATH`. Same-origin also
removes CORS and third-party-cookie questions entirely. Terminate TLS in front of
the app and enable HSTS.

The server refuses to start if: the election configuration is invalid, it is
marked `isSeedData`, `SPREADSHEET_MODE=spool`, or a required secret is missing, shorter than
32 characters, or still a placeholder.

**Back up `DATABASE_PATH` (and its `-wal` file) on a schedule, and rehearse a
restore before election day.** The whole election is that one file.

## Resetting development data

```bash
npm run db:reset                          # delete the database entirely
npm run seed                              # reload the configured election
npm run db:reset -w @mesa/server -- --codes   # purge access-code hashes only
rm -rf apps/server/.excel-spool           # clear the local spreadsheet spool
```

`db:reset` refuses to run under `NODE_ENV=production` without `--i-understand`,
because the immutability triggers make it the only way to remove a ballot — and
that should never be a reflex.

## Documentation

| Document | What is in it |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | layering, the critical path step by step, concurrency, failure modes, seven ADRs |
| [`docs/product-spec.md`](docs/product-spec.md) | the journey screen by screen, functional requirements mapped to tests, fixed copy |
| [`docs/voting-logic.md`](docs/voting-logic.md) | eligibility, step sequences, validation, the weighting model, the zero-turnout decision |
| [`docs/security-model.md`](docs/security-model.md) | threats → controls → tests, identity, ballot secrecy and its limits, what is *not* protected, pre-election checklist |
| [`docs/data-model.md`](docs/data-model.md) | configuration schema, SQL schema, retention, the Excel workbook shape |
| [`docs/design-direction.md`](docs/design-direction.md) | "Mesa Departures" — tokens, the split-flap spec, screen-by-screen motion plan |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | the fifteen phases, sequencing rationale, risk register |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | React Bits attribution and dependency licences |
