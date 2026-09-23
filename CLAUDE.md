# CLAUDE.md — the whole project, in one file

> **Read this first.** It is the orientation document for anyone new to this
> repository — a person or an AI assistant. It explains what the system is, how
> it is put together, why the unusual decisions were made, how to run it, and
> what will bite you. Everything here was verified against the code on
> 2026-09-23 (`main` @ `35632e2`); where a detail lives in a deeper document,
> the link is given.

---

## Contents

1. [What this is](#1-what-this-is)
2. [Quick start](#2-quick-start)
3. [Repository map](#3-repository-map)
4. [The domain: what an election *is* here](#4-the-domain-what-an-election-is-here)
5. [Architecture and the critical path](#5-architecture-and-the-critical-path)
6. [The database](#6-the-database)
7. [HTTP API reference](#7-http-api-reference)
8. [Identity and authentication](#8-identity-and-authentication)
9. [The election desk (`/monitor`)](#9-the-election-desk-monitor)
10. [Google Sheets mirror](#10-google-sheets-mirror)
11. [Results and weighting](#11-results-and-weighting)
12. [The web app](#12-the-web-app)
13. [Artwork pipelines](#13-artwork-pipelines)
14. [Configuration and environment](#14-configuration-and-environment)
15. [Commands](#15-commands)
16. [Testing](#16-testing)
17. [Deployment](#17-deployment)
18. [Election-day runbook](#18-election-day-runbook)
19. [Conventions and guardrails](#19-conventions-and-guardrails)
20. [Current state, known gaps, gotchas](#20-current-state-known-gaps-gotchas)
21. [Open questions and next steps](#21-open-questions-and-next-steps)
22. [Further reading](#22-further-reading)

---

## 1. What this is

A single-election voting system built for **Mesa School of Business** (the Forge
C27 cohort). Two electorates — **students** and **employees** — vote on shared
kiosks in a hall over a few hours. Students vote for six leadership positions
plus the captain of their own house; employees vote for the six leadership
positions only. Results combine both electorates with configured weights
(75% student / 25% employee) resolved **per position**, so a house-captain
contest is scored student-only at 100%.

Scale is small (low hundreds of voters). The **integrity bar is not**: one
person one vote, ballot secrecy, no silent vote loss, no trust in the client.
Low scale is what lets the system use a single-node SQLite database and get
serialisability for free rather than building distributed coordination.

**Why it exists.** The goal is an election whose integrity can be *shown*
rather than taken on trust. It has to give one ballot per person, keep choices
secret by the shape of the data, and apply eligibility per voter (an employee
never sees a house-captain contest). Results still have to land somewhere the
organisers already work, which is a Google Sheet. The repo doesn't record what
Mesa used before this system.

**There are now two backends** for the same ballot (§5, §17):

- **Express + SQLite** (`apps/server`) runs on a laptop in the hall. It is the
  stronger system: real transactions, immutability triggers, a hash-chained
  audit log, and the `/monitor` desk.
- **Google Apps Script + the Sheet** (`apps-script/`) runs with the ballot on
  Vercel at `/voting`. You get a permanent public URL and nothing to keep
  switched on, and the Sheet is the only store. It is weaker in ways that
  `docs/apps-script-deployment.md` spells out. Most commits since 2026-09-22
  target this path.

The web app talks to Apps Script when `VITE_APPS_SCRIPT_URL` is set at build
time, and to Express when it isn't.

| | |
| --- | --- |
| Repo name | `mesa-elections` (npm workspaces monorepo) |
| Git remote | `https://github.com/chaaandu/Forge-Student-Election.git` |
| Runtime | Node **22+** (developed on 24), npm 10+ |
| Server | Express 5 + better-sqlite3 (WAL) + zod |
| Web | React 19 + Vite 7 + Tailwind 4 + ogl/three (artwork only) |
| Domain core | `packages/election-core` — pure TypeScript, one dependency (zod) |
| Hosted backend | Google Apps Script (ES5 `.gs`, pasted into the Sheet's script editor) |
| Tests | Vitest, 3 projects (`core`, `server`, `web`), 42 files / 537 tests, plus `npm run appsscript:verify` |
| Live election data | 10 positions · 4 houses · 25 candidates · 145 voters (119 students, 26 employees) |
| Auth mode in use | `supervised` (voter picks their own name with an invigilator present). Apps Script supports only this mode |
| Spreadsheet | Express: a downstream mirror via a service account. Apps Script: the Sheet *is* the store |
| CI | none. No workflow files and no Dockerfile. `npm run verify` is run by hand |

The current election configuration is **real data, not seed data**
(`isSeedData` is absent from `apps/server/config/election.config.json`).

---

## 2. Quick start

```bash
npm install
npm approve-scripts better-sqlite3 esbuild   # npm 11+ gates native builds

cp .env.example .env                          # development defaults are fine
npm run seed                                  # load the election + roll into SQLite
npm run dev                                   # API :8787, web :5173
```

- Ballot — <http://localhost:5173>
- Election desk — <http://localhost:8787/monitor> (admin token `dev-admin-token` locally)
- Speeches wall — <http://localhost:5173/wall.html> (`/wall` once served by the API)
- Personal link — <http://localhost:5173/voting/stu-abeer-bhati> (any roll id; see §12)

There is **one `.env`, at the repository root**, and both halves read it. The
server loads it by absolute path, and Vite's `envDir` points at the root. A
stray `apps/server/.env` or `apps/web/.env` is ignored. If `VITE_APPS_SCRIPT_URL`
is set there, the local web app talks to the Apps Script deployment rather than
to `npm run dev`'s Express server.

The voter roll (`apps/server/config/voters.json`) is **git-ignored** because it
contains 145 real names and school email addresses. A fresh clone therefore has
no roll. Use `apps/server/config/voters.sample.json`, or regenerate the real one
with `npm run data:build` (needs the source spreadsheet/PDF, also git-ignored).

> **But the same roll is committed elsewhere.** `apps-script/Config.gs` is
> generated from `voters.json` and holds all 145 names and full email addresses.
> It is tracked in git, and the GitHub repository is **public**. See §20.

---

## 3. Repository map

```
apps/
  server/                     Express 5 + SQLite. The only authority.
    config/                   election.config.json · voters.json (git-ignored) · voters.sample.json
    src/
      config/env.ts           zod-parsed environment + production guards
      context.ts              composition root — all wiring lives here, no singletons
      main.ts                 boot, banner, graceful shutdown
      db/                     schema.sql + repositories (election, audit, idempotency, outbox)
      election/configStore.ts loads + validates config, refuses seed data in production
      identity/               supervised · access-code · entra providers
      http/                   app.ts, routes/, middleware, rate limiting, monitor.html
      services/               VotingService · ResultsService · ResultsPublisher ·
                              SyncWorker · SessionService · ElectionReset · adminAuth
      spreadsheet/            SpreadsheetRepository port → Google Sheets | Graph Excel | JSONL spool
      scripts/                seed · reset · genSecrets · monitorPassword
  web/                        React 19 + Vite. Presentation and flow only.
    src/
      generated/election.ts   GENERATED by `election:bake` — houses/positions/candidates
                              compiled into the bundle (committed; no roll in it)
      machine/                the voting state machine (contains no election rules)
      screens/                Welcome · CheckIn · IdentityConfirm · Position · Review ·
                              Submitting · Done · SpeechesWall
      components/             bauhaus/ · election/ · ui/ · backdrop/ · ink/ · noren/ · paper/
      lib/                    api (Express *and* Apps Script transport) · voterLink ·
                              houseCrest · color · copy · ground · voterType ·
                              candidatePhoto · webgl
      styles/                 tokens.css · global.css · wall.css · fonts.css
      assets/candidates/      imported, cropped, compressed candidate photos (committed)
    public/                   candidates/*.svg placeholders · houses/*.png · paper/ · noren/
    vendor/threeui/           vendored ThreeUI sources + SOURCE.json checksums
    wall.html / src/wall.tsx  the projected speeches wall — a second entry point
packages/election-core/       Pure domain: types · config schema · eligibility · steps ·
                              validation · results (weighting). No I/O, no framework.
apps-script/                  The hosted backend, pasted into the Sheet's script editor:
                              Config.gs (GENERATED; contains the roll) · core.gs (doGet/doPost
                              API) · results.gs (weighting, menu) · dashboard.gs · setup.gs
docs/                         Ten deep documents (see §22)
scripts/                      Build/import/verify tooling (see §15)
assets/                       Drop zones: candidate-photos/ (ignored), house-logos/ (committed)
```

**Dependency direction is strictly one-way.** `election-core` knows nothing
about HTTP, React or SQLite. Both the browser and the server import it — the
browser for instant feedback, the server as the only answer that counts.

**Apps Script can't import it.** `apps-script/*.gs` contains a second, hand-written
ES5 copy of eligibility, validation and weighting. `npm run appsscript:verify`
(`scripts/verify-apps-script.ts`) runs the `.gs` files in a Node sandbox and
checks them against `election-core` on the same scenarios. That is the only
thing that stops the two drifting apart, and it isn't part of `npm test` or
`npm run verify`.

---

## 4. The domain: what an election *is* here

Nothing about this particular election is in the code. Two JSON files define it.

### `apps/server/config/election.config.json`

```jsonc
{
  "election": {
    "id": "mesa-forge-c27",
    "name": "Forge Student Elections",
    "status": "open",                       // draft | open | closed
    "weights": { "student": 0.75, "employee": 0.25 },   // must sum to 1
    "zeroTurnoutPolicy": "renormalise"      // renormalise | treat-as-zero
    // "opensAt" / "closesAt": ISO-8601, optional; the server refuses ballots outside
    // "isSeedData": true marks demo data — production refuses to boot with it
  },
  "houses":     [ { "id", "name", "color", "shape", "crestUrl", "motto" } ],
  "positions":  [ { "id", "title", "shortTitle", "order", "kind", "houseId", "eligibility" } ],
  "candidates": [ { "id", "name", "positionId", "tagline", "photoUrl", "active" } ]
}
```

Current positions, in gate order:

| # | id | kind | electorate |
| --- | --- | --- | --- |
| 1 | `president` | leadership | student + employee |
| 2 | `vice-president` | leadership | student + employee |
| 3 | `academic-lead-boy` | leadership | student + employee |
| 4 | `academic-lead-girl` | leadership | student + employee |
| 5 | `community-lead-boy` | leadership | student + employee |
| 6 | `community-lead-girl` | leadership | student + employee |
| 7–10 | `house-captain-{samurai,knights,gladiators,vikings}` | house-captain | students of that house only |

Houses carry **a colour and an elementary form**, so identity never rests on
colour alone: Samurai `#2F57A8` circle, Knights `#B83325` square, Gladiators
`#628838` arc, Vikings `#EEC048` triangle. The colours are *sampled from the
real crest artwork* by `scripts/sample-crest-colour.py` — they were once all
four rotated because someone guessed before seeing the art.

### `apps/server/config/voters.json` (git-ignored)

```jsonc
[ { "id": "stu-abeer-bhati", "name": "Abeer Bhati",
    "email": "abeer_bhati@forge27.mesaschool.co", "type": "student", "houseId": "vikings" } ]
```

### The one field everything derives from

```jsonc
{ "id": "president",             "eligibility": { "voterTypes": ["student", "employee"] } }
{ "id": "house-captain-vikings", "eligibility": { "voterTypes": ["student"], "houseId": "vikings" } }
```

The step engine, the progress indicator, the review screen, client **and**
server ballot validation, turnout, and per-position weighting all read that one
field. An employee's journey is Community Lead → Review; the House Captains
step is not hidden or disabled for them, **it is not in their sequence at all**,
and their progress reads `6 / 6`.

There is deliberately **no `if (voter.type === 'employee')`** anywhere outside
`election-core`. `npm run check:branching` fails the build if one appears; a
genuinely presentational use must be annotated
`// eligibility-branch-ok: <reason>`.

### Config validation

A zod schema rejects, reporting *every* problem at once rather than the first:
weights that do not sum to 1, a position with no eligible voter types, a
position with no active candidates, an orphan candidate, a house-captain
position with no house scope, a student with no house, a voter eligible for
nothing, duplicate emails, and a `javascript:` photo URL. Invalid config = the
server refuses to start.

**Running next year's election means editing those two files, not the code.**

---

## 5. Architecture and the critical path

```
┌────────────────────────────────────────────────────────────┐
│ Presentation      apps/web — screens, motion, a11y         │
├────────────────────────────────────────────────────────────┤
│ Flow              apps/web/src/machine — guarded FSM       │
├──── network boundary — nothing above here is trusted ──────┤
│ HTTP              apps/server/src/http — authn/z, limits   │
├────────────────────────────────────────────────────────────┤
│ Services          Voting · Results · Sync · Session · Reset│
├────────────────────────────────────────────────────────────┤
│ Domain (pure)     packages/election-core                   │
├────────────────────────────────────────────────────────────┤
│ Persistence       SQLite WAL + repositories                │
├────────────────────────────────────────────────────────────┤
│ Integration       SpreadsheetRepository → Sheets|Graph|spool│
└────────────────────────────────────────────────────────────┘
```

### Recording a ballot

One `BEGIN IMMEDIATE` transaction contains, in order:

1. idempotency check (same key → replay the original response),
2. election-window check,
3. **re-read of the voter from the database** (never from the request),
4. server-side `validateBallot` against the voter record *the server loaded*,
5. the anonymous ballot + its selections,
6. the participation mark,
7. the spreadsheet outbox rows,
8. the audit entry.

There is no state in which a ballot exists but the voter is not marked as having
voted. Three independent mechanisms prevent a second ballot; the load-bearing
one is a compare-and-swap — `UPDATE voters SET has_voted = 1 WHERE has_voted = 0`
— whose affected-row count is asserted. The others are the `vote_receipts`
primary key and the precondition read. This is proved by
`apps/server/src/__tests__/concurrency.test.ts`, which spawns **eight real OS
processes** contending for the same database file.

Rejections are audited **outside** the transaction, because an audit row written
inside a transaction that then aborts disappears with it — and rejections are
exactly what an election most needs recorded.

### The same ballot on Apps Script

`core.gs` exposes one `/exec` URL. GET `action=` handles `election | roll |
lookup | session | turnout` and POST `action=` handles `select | ballot`.
`castBallot_` runs these steps in order:

1. idempotency replay from `CacheService`
2. verify the token
3. check `CONFIG.election.status`
4. `LockService` lock, waiting up to 30 s and then returning `BUSY`
5. replay from the cache again
6. re-read the voter from the Roll tab
7. the already-voted check against the Voters tab. A retry carrying the *same*
   key gets its original receipt back rather than `ALREADY_VOTED`.
8. `validate_`
9. append Ballots first (no voter column, hour-bucketed), then the Voters row

There are no `opensAt`/`closesAt` checks on this path; only `status` counts,
and it is baked into `Config.gs`.

The session token is HMAC-signed with a `SESSION_SECRET` Script Property, which
`setup()` generates. The body carries only selections. What the script gives up
compared with Express is listed in `docs/apps-script-deployment.md`: no
immutability, no audit chain, and anyone who can edit the Sheet can edit votes.

The client absorbs the different transport in `apps/web/src/lib/api.ts`:

- It sends `text/plain` so the browser skips a CORS preflight that Apps Script
  can't answer.
- It retries `UPSTREAM`/`TIMEOUT` up to four times within a wall-clock budget
  (20 s by default, longer for casting). The reason is that Google's redirect
  hop drops about one reply in three, measured.
- It fetches the whole masked roll once and searches it in the browser.
- It reads the election from the baked bundle rather than over the network.

---

## 6. The database

SQLite, WAL mode, single writer, at `DATABASE_PATH` (default
`apps/server/data/elections.sqlite`). Schema: `apps/server/src/db/schema.sql`.

Two record families that **share no key**:

| Attributable — "did this person vote?" | Anonymous — "what did the electorate choose?" |
| --- | --- |
| `voters` (`has_voted`, `voted_at`, access-code hash/lockout) | `ballots` (random UUID id, `voter_type`, **hour-bucketed** `submitted_hour`) |
| `vote_receipts` (PK on `voter_id`, unique `receipt_id`) | `ballot_selections` (PK `(ballot_id, position_id)`) |

**There is no `voter_id` column on a ballot anywhere.** "Who voted for whom" is
not forbidden by policy, it is *unwritable*. Ballot ids are random rather than
sequential and timestamps are bucketed to the hour, so insertion order cannot be
correlated with `voted_at`.

Supporting tables: `sessions` (token **hash** only), `auth_requests` (OAuth
state + PKCE), `handoff_codes` (so a session token never enters a URL),
`idempotency_keys`, `outbox`, `audit_log`, `meta`.

**Immutability triggers** abort updates and deletes on `ballots`,
`ballot_selections`, `vote_receipts` and `audit_log`, plus any attempt to set
`has_voted` back to 0 ("a cast vote cannot be withdrawn"). The documented way
around them is `ElectionReset`, which drops and rebuilds the tables rather than
quietly disabling the guards.

**The audit log is append-only and hash-chained** — each row commits to its
predecessor, so editing any historical row invalidates every hash after it.
`GET /api/admin/audit/verify` walks the chain. Selections and secrets are never
written to it; the repository *throws* if you try.

---

## 7. HTTP API reference

### Public / voter

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | status, election id, config version, auth mode, `adminSignIn: password\|token` |
| `GET` | `/api/election` | houses, positions, candidates, window, auth descriptor |
| `GET` | `/api/auth/mode` | mode, `supportsRollSearch`, `requiresSupervision` |
| `POST` | `/api/auth/lookup` | roll search — **requires the kiosk token**; 2-char minimum, 8 results max, masked emails |
| `POST` | `/api/auth/verify` | access-code verification (access-code mode) |
| `POST` | `/api/auth/select` | supervised check-in: issues a session for the selected voter |
| `GET` | `/api/auth/entra/start` · `/callback` · `POST /exchange` | Entra OAuth + PKCE + one-time handoff code |
| `GET` | `/api/session` | the voter's own profile **and their own gate sequence** |
| `POST` | `/api/session/end` | revoke |
| `POST` | `/api/ballots` | cast. Requires a session **and** an `Idempotency-Key` header (8–128 chars) |

### Admin (`Authorization: Bearer <token>`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/admin/session` | desk sign-in with email + password → short-lived session token. Mounted *before* the auth middleware. 10 attempts / 15 min |
| `GET` | `/api/admin/results` | full weighted results, per position |
| `GET` | `/api/admin/results.csv` | the same, flattened |
| `POST` | `/api/admin/results/publish` | queue a snapshot to the spreadsheet |
| `GET` | `/api/admin/turnout` | by voter type |
| `GET` | `/api/admin/monitor` | who has voted — **participation only, never choices** |
| `POST` | `/api/admin/reset` | destroy every ballot. Body must contain the election's own name typed out |
| `GET` | `/api/admin/audit` · `/audit/verify` | list / walk the hash chain |
| `GET` | `/api/admin/sync/status` · `/sync/failed` · `POST /sync/retry` | outbox depth, dead letters, requeue |
| `GET` | `/monitor` | the election-desk page itself (served by the API, not the SPA) |

### Cross-cutting

- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, a `Permissions-Policy`,
  and `Cache-Control: no-store`. `/paper` and `/noren` are narrowed to
  `SAMEORIGIN` because the artwork loads in a sandboxed iframe — under `DENY`
  a *deployed* build shows Chrome's blocked-content placeholder while
  development looks fine.
- JSON body limit **16 kb**. A ballot is a few hundred bytes.
- CORS only exists for the Vite dev server; production is same-origin.
- **Rate limits are keyed for a shared kiosk.** A hall is one NAT address with a
  queue behind it, so per-IP limits would throttle the election itself (they
  did, in testing).

| Limiter | Limit | Key |
| --- | --- | --- |
| global ceiling | 600 / min | IP — a runaway-client guard, not a policy |
| roll lookup | 120 / min | IP (type-ahead; protected instead by the kiosk token) |
| access-code verify | 8 / 15 min | **voter id** |
| ballot submit | 8 / min | **voter id** |
| admin sign-in | 10 / 15 min | IP |

---

## 8. Identity and authentication

Selecting a name in the UI is **navigation, not authentication**. Whatever the
mode, the session token issued afterwards is what `/api/ballots` trusts, and it
carries the voter id *server-side*. `voterId` and `voterType` are not in the
submission schema at all, so a forged value has nowhere to land.

### `supervised` — what Mesa uses

The voter picks their own name at a booth with a Mesa employee in the room, as
at a polling station. The honest accounting:

- **Still guaranteed in software:** one ballot per voter ever; no ballot for
  someone already marked as voted; a ballot containing positions the voter is
  not eligible for rejected whole; every check-in and ballot in a tamper-evident
  log.
- **Not guaranteed:** that the person at the booth is who they selected. The
  invigilator carries that, backed by three affordances — the confirmation
  screen sets the name large enough to read across a booth, roll search visibly
  marks names that have already voted, and `/monitor` reconciles the room live.
- **Use something else if** the election is not physically supervised or the
  invigilator does not know the electorate by sight.

### `access-code`

Printed 6-character slips handed over against student ID; scrypt-hashed with a
per-voter salt plus a global `ACCESS_CODE_PEPPER`; 5 attempts then a lockout.
Issue codes with `npm run seed -w @mesa/server -- --codes`.

### `entra`

Microsoft Entra ID sign-in, OAuth + PKCE. The session token is never placed in a
URL — the SPA exchanges a short-lived one-time handoff code for it over POST.

All three are fully implemented and tested; switching is one environment
variable.

---

## 9. The election desk (`/monitor`)

A self-contained HTML page served by the **API**, deliberately not part of the
voting SPA, so it cannot be reached from a booth by navigating the voter flow.
The page is public; every byte of data it renders requires the admin credential.

Two ways in:

- **Email + password** when `MONITOR_EMAIL` and `MONITOR_PASSWORD_HASH` are set.
  The password is never stored — the hash is `scrypt$salt$hash`. Signing in does
  **not** hand the browser `ADMIN_API_TOKEN`; the server mints a separate HMAC
  session token carrying its own expiry (`MONITOR_SESSION_HOURS`, default 12 —
  a polling day, so nobody is signed out mid-count).
- **Pasting `ADMIN_API_TOKEN`** when those are unset. This is how scripts
  authenticate.

Failed sign-ins are audited without recording the address attempted — a failed
sign-in log that fills with addresses is a second place the roll leaks from.

**The room tab** refreshes every 4 s: turnout overall, by voter type and by
house, plus the full roll with who has voted and when. Search by name, or filter
to *Still to vote* to chase stragglers near closing. It reports **participation
only**.

**Results tab** (`/monitor#results`): one line per contest — who leads, their
weighted score, the margin, and a bar in that house's colour for a captain's
contest or in ink otherwise. Open a line to expand the full field in place, with
provenance written out (`7 of 9 students · 3 of 4 employees`). Ties are shown as
ties and never broken; a contest with no votes says so rather than crowning a
winner on nothing. CSV download at the foot. It polls on a slower beat than the
roll, and only while that tab is open — every calculation is an audited event,
and a 4-second poll would bury the audit log under the act of watching it.

---

## 10. Google Sheets mirror

**The spreadsheet is a downstream mirror, never the source of truth.**

```
ballot transaction ──▶ outbox (same transaction: enqueue is atomic with the vote)
                          │
                   SyncWorker ──▶ Google Sheets
                          ├─ transient (429/5xx) → exponential backoff + jitter
                          ├─ permanent (403/404) → dead-letter, shown on /sync/status
                          └─ never deletes the row; the vote is already durable
```

A vote is recorded when the local transaction commits, and that is when the
voter is told so. If Google is unreachable for the entire election, results are
still complete and exportable; the sync drains afterwards. Delivery is
at-least-once.

### Setting it up (~10 minutes)

1. Create a Google Sheet; copy its id from the URL.
2. Google Cloud → new project → **enable the Sheets API** → create a **service
   account** → download its **JSON key**.
3. **Share the sheet with the service account's email, as Editor.** This is the
   step people miss; a `403` means you skipped it.
4. Set `SPREADSHEET_MODE=sheets`, `SHEETS_SPREADSHEET_ID`, and
   `GOOGLE_SERVICE_ACCOUNT_JSON` (inline) or `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`.
5. `npm run sheets:check` then `npm run sheets:setup`.
6. Insert the two charts from the Dashboard ranges (two clicks each).

> **An API key will not work.** API keys can only *read* public sheets. Writing
> needs a service account the sheet is shared with.

| Tab | Contents | When |
| --- | --- | --- |
| `Dashboard` | turnout · by house · who is winning, one row per contest · every candidate | live formulas |
| `Roll` | everyone eligible | seeded at setup |
| `Voters` | one row per person as they vote | live |
| `Ballots` | one row per selection — **anonymous, no voter reference** | live |
| `Candidates` | the candidate list | seeded at setup |
| `Results` | a timestamped snapshot per publish | on publish |

`ResultsPublisher` publishes a snapshot whenever the ballot total **moves**
(`RESULTS_PUBLISH_INTERVAL_MS`, 60 s default) — never on an unchanged count, and
the last published count is remembered in the database rather than in memory, so
a restart does not append a duplicate.

> **This puts a running count in the spreadsheet while voting is open.** Anyone
> the sheet is shared with can watch it move. Set `RESULTS_PUBLISH_ENABLED=false`
> if that is unacceptable; publishing then goes back to a deliberate act.

`SPREADSHEET_MODE=spool` (development default) runs the identical sync path but
writes JSONL to `.excel-spool/`, so the first run against a real sheet is not
the first run at all. **Production refuses to start with `spool`** — the most
plausible go-live mistake is everything appearing to work while nothing reaches
the spreadsheet. `SPREADSHEET_MODE=excel` keeps the Microsoft 365 / Graph
implementation available.

---

## 11. Results and weighting

Results are never exposed to voters and always require the admin credential.

For each position, each eligible voter type is normalised **independently** and
then weighted:

```
share(c,t) = votes(c,t) / totalVotes(position, t)     // 0 if that group cast nothing
final(c)   = Σ_t share(c,t) × effectiveWeight(position, t)
```

No group size appears anywhere in the code — denominators come from the votes
actually cast, so the arithmetic is identical for 119 students or 1,190.

Effective weights are resolved **per position** from its eligibility: when only
one group is eligible, that group carries 1.0. Every result row is labelled with
the rule applied (`Weighted 75/25 (student/employee)` vs `Student-only (100%)`),
so a reader of the spreadsheet cannot mistake one for the other.

> **One governance decision.** When a group is *eligible but casts zero votes*,
> the default `zeroTurnoutPolicy: "renormalise"` drops it and renormalises, so
> scores stay on a 0–100% scale. The alternative, `"treat-as-zero"`, retains the
> weight and caps the attainable score at 75%. **The ranking and the winner are
> identical either way** — it is a presentation choice, not an outcome choice.
> Both are implemented and tested. Rationale: `docs/voting-logic.md §6.1`.

---

## 12. The web app

### The state machine

`apps/web/src/machine/electionMachine.ts` — a reducer with these phases:

```
LOADING → WELCOME → CHECK_IN → IDENTITY_CONFIRM → GATE* → REVIEW
        → FINAL_CALL → SUBMITTING → DEPARTED        (BLOCKED on a fatal error)
```

Every transition is guarded: an action that does not apply to the current phase
returns the state unchanged rather than half-applying, so no sequence of clicks
— or a stray event during an animation — can produce "submitting with no
selections" or "review before the last gate". `steps` is the voter's **own**
eligible positions, as decided by the server.

The idempotency key is **generated once per ballot and reused on every retry**,
never regenerated. A repeated key replays the original response; a *new* key
from a voter who has already voted is still rejected — idempotency de-duplicates
retries, it is not what enforces one-vote.

Kiosk behaviours in `App.tsx`: a 5-minute idle reset (a voter who walks away
mid-ballot must not leave the kiosk on their screen), a `sessionStorage` ballot
draft, and a celebration hold of `VITE_CELEBRATION_SECONDS` before resetting for
the next voter.

**Changes made for the Apps Script transport** (commits of 2026-09-22 and 23):

- **The election is baked into the bundle.** `scripts/bake-election.mjs` runs on
  the web app's `predev`/`prebuild` and writes `src/generated/election.ts`. On
  Apps Script the ballot opens without a network request. `api.electionFresh()`
  re-checks `status` in the background and applies it only while nobody is
  mid-ballot.
- **Check-in doesn't wait for the session.** `IDENTIFIED` can carry
  `token: null`, so the voter moves on while `select` is still in flight. If the
  session comes back refused, the voter is stopped mid-flow; `flow.test.tsx`
  covers this.
- **Personal links.** `/voting/<voter_id>` (`lib/voterLink.ts`, read from the
  path only, never the query string) opens on *Continue as \<name\>* with no
  search. A link picks a name; it doesn't prove who is holding the phone. The
  one-vote rule and eligibility are still enforced server-side.
- **The roll is searched in the browser** on Apps Script
  (`rollSearchIsLocal`). The whole masked roll comes over in one request and is
  cached in `sessionStorage`. The Express path still uses the kiosk-token
  `/api/auth/lookup`.

### Copy

`apps/web/src/lib/copy.ts` holds every string carrying legal or integrity
weight, verbatim, so a redesign cannot quietly soften a warning. Tests assert
the exact text. The voice rules: short sentences, second person, no jargon, no
exclamation marks, no em dashes; errors lead with what it means for the voter;
nothing implies the voter chose well — **we celebrate turning up, never the
choice**; contract everything *except* the three serious lines (a vote cannot be
changed; nothing was saved), where the change of register is the point.

`apps/server/src/__tests__/voice.test.ts` enforces the same rules on the
**server's** error strings, because the client passes election-window messages
straight through and a themed phrasing (`GATE CLOSED`) once survived there for
months after the client copy was rewritten.

### Design system

"**Vote / Form**" — a Bauhaus *grammar*, not a Bauhaus palette: primaries,
elementary forms, heavy black rules, one plate per position. The full argument
is in `docs/design-direction.md` (655 lines). The load-bearing rules:

- **A colour is a field, not ink.** House colour fills a shape; text on it is
  chosen by `accessibleField`/`inkOn` in `lib/color.ts`, which is unit-tested
  for measured contrast.
- **House identity is colour *and* form**, never colour alone.
- **Every position is the same size** — no contest looks more important.
- Two grounds: `night` (default) and `paper` (`VITE_GROUND=paper`), both kept
  working, which is what proves the palette is ground-independent.
- Guardrails (§8): no gradient that reads as a gradient, no glow, no
  glassmorphism, no blur — with one recorded exception, the check-in aurora.
  Themed language never replaces plain language.

### The speeches wall

`/wall` is a **second entry point** (`wall.html` → `src/wall.tsx`), not a route
inside the ballot, because sharing an entry would put a 3D scene in the voting
bundle and the voting machine in the projector's. It is projected in the hall
while candidates speak, needs no API and no database, and every word it shows is
printed into the cloth texture itself rather than overlaid — so it reads the
same at 1080 wide as at 1920. There is a non-WebGL CSS fallback.

---

## 13. Artwork pipelines

Four generated-asset pipelines, all idempotent and all safe to re-run.

| Command | What it does |
| --- | --- |
| `npm run photos:import` | Drop photos in `assets/candidate-photos/` named after the candidate (`Sairaj G.jpg`, `sairaj-g.png`, or the candidate id — matching ignores case, punctuation and spacing). Each is cover-cropped **top-aligned** (so a head is never cut) to 600×460 and compressed — a 4 MB phone picture becomes ~50 KB — into `apps/web/src/assets/candidates/`. Originals stay untouched, are git-ignored, and **can be deleted once imported**; re-running will not undo the import. Anyone without a photo keeps an initials placeholder. Runs automatically on `predev` and in `build`. |
| `npm run houses:import` | Drop one PNG per house in `assets/house-logos/`, named by house id. Optimised to a 32-colour palette, and **the house colour is re-sampled from the artwork** by `sample-crest-colour.py` (which ignores the background and black field and reads the helm). Missing houses get a drawn placeholder in the same shape. |
| `npm run paper:build` | Derives the welcome-screen paper from the vendored ThreeUI `3d-paper` source. |
| `npm run noren:build` | Derives the speeches-wall washi noren from the vendored ThreeUI `woven-cloth` source. |

The two ThreeUI pipelines are **derivations, not recreations**: each verifies the
vendored source byte-for-byte against a published SHA-256, then applies a small
enumerated set of replacements to the *content layer only* — the shaders,
simulation, lighting, camera, interaction and reduced-motion paths are untouched.
Fonts and the three.js bundle are **inlined as data URIs**, because a hall kiosk
on flaky wifi must not make a third-party request mid-election, and because the
frame is sandboxed without `allow-same-origin` (opaque origin → even a
same-origin font file would be refused by CORS). Checksums live in
`apps/web/vendor/threeui/SOURCE.json`; tests assert them.

---

## 14. Configuration and environment

Full annotated list in `.env.example`. Only `VITE_`-prefixed variables reach the
browser, and `npm run check:client-secrets` fails the build if a server secret
name appears anywhere under `apps/web`.

| Variable | Notes |
| --- | --- |
| `NODE_ENV` · `PORT` · `DEV_CORS_ORIGIN` | runtime |
| `ELECTION_CONFIG_PATH` · `VOTER_ROLL_PATH` | validated at boot; invalid = refuse to start |
| `DATABASE_PATH` | the whole election is this one file |
| `AUTH_MODE` | `supervised` \| `access-code` \| `entra` |
| `KIOSK_TOKEN` / `VITE_KIOSK_TOKEN` | device credential gating roll *search*. Must match. Casts no votes |
| `ACCESS_CODE_PEPPER` | global pepper for code hashes; rotating invalidates every issued code |
| `HASH_SALT` | salts IP and user-agent hashes in the audit log — abuse is investigable without storing PII |
| `SESSION_TTL_MINUTES` | voting session lifetime (20) |
| `SPREADSHEET_MODE` | `sheets` \| `excel` \| `spool`. **Production refuses `spool`** |
| `SHEETS_SPREADSHEET_ID` · `SHEETS_TAB_*` | column names are read from row 1 at runtime, so columns can be reordered freely |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `_KEY_FILE` | the whole key file, inline or by path. Never commit it |
| `EXCEL_*` · `MICROSOFT_*` | Graph / Entra credentials, required only in those modes |
| `SYNC_ENABLED` · `SYNC_INTERVAL_MS` · `SYNC_BATCH_SIZE` · `SYNC_MAX_ATTEMPTS` | outbox worker |
| `RESULTS_PUBLISH_ENABLED` · `RESULTS_PUBLISH_INTERVAL_MS` | automatic snapshots |
| `ADMIN_API_TOKEN` | bearer for `/api/admin/*` and the desk. ≥32 chars, non-placeholder in production |
| `MONITOR_EMAIL` · `MONITOR_PASSWORD_HASH` · `MONITOR_SESSION_HOURS` | desk sign-in; hash form `scrypt$salt$hash` |
| `VITE_APP_NAME` · `VITE_API_BASE_URL` · `VITE_CELEBRATION_SECONDS` · `VITE_GROUND` | browser-side |
| `VITE_APPS_SCRIPT_URL` | the Apps Script `/exec` URL. If set, the whole client talks to Apps Script instead of Express. Set in Vercel's project env for the hosted ballot. **Missing from `.env.example`** |

`npm run gen:secrets` prints a ready-to-paste block of fresh secrets.

All of this lives in **one root `.env`** (§2). Default config/database paths are
anchored to `apps/server`, not to `cwd`, so `node apps/server/dist/main.js` works
from the root. A path you set explicitly stays relative to `cwd`.

**Apps Script has no `.env`.** Its only secret is the `SESSION_SECRET` Script
Property, generated by `setup()`. Its other state lives in Script Properties
too: `BALLOT_EPOCH`, which a reset bumps, and the `RESULTS_AT`/`DASHBOARD_AT`
fingerprints. Everything about the election itself is compiled into `Config.gs`.

**Production boot guards** (`apps/server/src/config/env.ts`) — the server
refuses to start if: the election config is invalid or marked `isSeedData`;
`SPREADSHEET_MODE=spool`; any of `ADMIN_API_TOKEN`, `KIOSK_TOKEN`, `HASH_SALT`
(plus `ACCESS_CODE_PEPPER` in that mode) is under 32 characters or matches
`/replace-me|changeme|example|xxxx/i`; a mode-required credential is missing; or
`MICROSOFT_REDIRECT_URI` is not https. *A misconfigured election that boots is
worse than one that does not.*

### What is git-ignored, and why

`.env*` (except the example) · service-account keys · `apps/server/config/voters.json`
(145 real names) · `*.pdf` and root `*.xlsx`/`*.csv` (source data about real
people) · `data/` and every SQLite file · `access-codes-*` (plaintext
credentials) · `.excel-spool/` · `assets/candidate-photos/*` originals ·
compiled `.js`/`.d.ts` emitted beside sources.

**Not ignored, though it holds the same personal data:** `apps-script/Config.gs`
(§20).

---

## 15. Commands

### Everyday

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web dev server together |
| `npm run build` | core → house logos → photos → paper → noren → server → web |
| `npm test` / `npm run test:watch` | the whole suite |
| `npm run typecheck` · `npm run lint` · `npm run format` | across all workspaces |
| `npm run verify` | lint + the three integrity checks + typecheck + tests + build |
| `npm run preflight` | `verify` **and** the no-seed-data check. Run before an election |

### Data and operations

| Command | What it does |
| --- | --- |
| `npm run seed` | load the configured election and roll into the database |
| `npm run seed -w @mesa/server -- --codes` | also issue one-time access codes |
| `npm run db:reset` | delete the database (refuses in production without `--i-understand`) |
| `npm run gen:secrets` | print fresh secrets |
| `npm run monitor:password -- <email> '<password>'` | print a `MONITOR_PASSWORD_HASH` for the desk sign-in |
| `npm run data:build` | rebuild `election.config.json` + `voters.json` from the source PDF/XLSX |
| `npm run election:bake` | regenerate `apps/web/src/generated/election.ts`. Runs automatically on web `dev`/`build` |
| `npm run appsscript:build` | regenerate `apps-script/Config.gs` from `election.config.json` + `voters.json` |
| `npm run appsscript:verify` | run the `.gs` files in a `node:vm` sandbox against `election-core`. **Always run after `appsscript:build` or any `.gs` edit** |
| `npm run election:serve` · `election:tunnel` | the laptop deployment (§17) |
| `npm run sheets:check` · `sheets:setup` | verify credentials / create tabs, headers, formatting, Dashboard |
| `npm run results:publish` | push a results snapshot now |
| `npm run sheets:retry` | requeue dead-lettered outbox rows against a local server |
| `npm run photos:import` · `houses:import` · `paper:build` · `noren:build` | the artwork pipelines (§13) |
| `npm run clean:emit` | delete stray compiled output beside sources |

### Integrity checks (all run inside `verify`)

| Command | Fails when |
| --- | --- |
| `npm run check:branching` | election logic branches on voter type instead of on configuration |
| `npm run check:client-secrets` | a server secret name is referenced from `apps/web` |
| `npm run check:css-vars` | a `var(--x)` resolves to nothing — this once made the signature ink tick invisible in every browser, silently |
| `npm run verify:no-seed` | demo candidates or `@seed.invalid` voters are configured |

Each of those exists because the thing it checks for actually happened. Do not
delete one to make a build pass.

---

## 16. Testing

```bash
npm test                              # everything
npx vitest run --project core         # domain logic only
npx vitest run --project server       # API, persistence, concurrency, sync
npx vitest run --project web          # machine, components, full journeys
npm run appsscript:verify             # the .gs port against election-core — NOT in npm test
```

As of 2026-09-23: **42 files, 537 tests, all passing.** `appsscript:verify` passes
too.

The server project runs with `fileParallelism: false` — the election database is
a single writer by design, and tests that exercise concurrency spawn their own
processes rather than relying on the runner.

| Suite | Covers |
| --- | --- |
| `core` | weighting including both zero-turnout policies, ties, unknown candidates, config validation, eligibility, step sequences, ballot validation |
| `server` | one-vote enforcement, **eight-process concurrency**, idempotency, forged payloads, roll masking, admin authz, audit-chain tampering, immutability triggers, Sheets auth/errors/header-ordering, spreadsheet failure/throttle/recovery, the monitor, the results publisher, the wall routing, server copy voice, end-to-end weighted results, shared-kiosk rate limits |
| `web` | the state machine, the colour system, ink-mark and button accessibility contracts, measured token and house-colour contrast, the candidate-photo pipeline, full student and employee journeys through the real UI, the Apps Script transport and in-browser roll search (`lib/__tests__/api.test.ts`), personal links (`voterLink.test.ts`) |
| `appsscript:verify` | weighting (two-way, zero-turnout, student-only, exact tie, no votes) computed by `results.gs` vs `election-core`; the Dashboard never writes an accidental formula and names both sides of a tie |

The three that matter most: `concurrency.test.ts` (eight OS processes, one
ballot), `flow.test.tsx` → *"NEVER shows success before the server responds"*,
and `results.test.ts` → *"applies student-only weighting to house captains,
uncapped"*.

---

## 17. Deployment

### The real deployment — one Node process

```bash
npm run preflight        # verify + refuse demo data
npm run build
npm run election:serve   # or: NODE_ENV=production node apps/server/dist/main.js
```

In production the API serves the built SPA from the same origin, so a deployment
is one Node process and one mounted volume for `DATABASE_PATH`. Same-origin
removes CORS and third-party-cookie questions entirely. Terminate TLS in front
and enable HSTS.

`npm run election:serve` is that command with the two checks around it that were
being made by hand: it refuses to start without a build, waits for `/api/health`
rather than reporting success at spawn, prints the LAN addresses a kiosk can
reach, and takes the server down cleanly on Ctrl-C. `npm run election:tunnel`
adds a free Cloudflare quick tunnel for a public https URL when the kiosks
cannot be put on the same wifi — needs `cloudflared` on `PATH`
(`brew install cloudflared`), no account and no card. The tunnel moves nothing:
the database still lives on that laptop, and the URL is regenerated on every
restart.

**Back up `DATABASE_PATH` and its `-wal` file on a schedule, and rehearse a
restore before election day.** The whole election is that one file.

### Why the Express server has no cloud deployment

(The hosted option is the Apps Script backend below. It isn't this server moved
to a cloud host.)

One person one vote is a `BEGIN IMMEDIATE` transaction against a single SQLite
file owned by a single process (ADR-3). A serverless host — Vercel, Netlify,
Lambda — gives a read-only filesystem, a `/tmp` wiped between invocations, and
several concurrent instances that cannot see each other's writes. It does not
refuse to run there; it accepts ballots into databases that are then discarded.
A platform-as-a-service free tier fails the same way more slowly: no persistent
disk, and the container recycled when idle. Anything hosting this needs a
process that stays up and a disk that persists.

### The hosted deployment — Vercel + Apps Script

Full steps are in `docs/apps-script-deployment.md`. In short:

1. `npm run appsscript:build && npm run appsscript:verify`
2. Paste the five `.gs` files into the Sheet (Extensions → Apps Script).
3. Run `setup` once. It creates the tabs, seeds Roll and Candidates, installs a
   **5-minute** `scheduledPublish` trigger and an `onEdit` roll-cache
   invalidator, and adds an **Election** menu.
4. Deploy as a Web app: Execute as **Me**, access **Anyone**. The `/exec` URL
   stays the same across new versions.
5. Set `VITE_APPS_SCRIPT_URL` in Vercel and redeploy.

On the day, the Sheet's **Dashboard** tab (drawn by `dashboard.gs`) is the
election desk; `/monitor` doesn't exist here. The **Roll tab is the live roll**
and can be hand-edited: *Election → Check the roll* validates it, and *Set up /
repair* won't overwrite it. *Election → Clear all votes…* is the reset, guarded
by typing the election name.

**Vercel serves `apps/web` as a static build.** Routes:

- `/voting` is the ballot, and `/voting/<voter_id>` is a personal link.
- `/wall` is the speeches wall.
- `/` **redirects to `/voting`**. It used to go to `/wall`, when the ballot had
  no backend there.

Without `VITE_APPS_SCRIPT_URL` the ballot on Vercel has nothing to talk to. It
fails with `Unexpected token 'T', "The page c"...`, which is Vercel's HTML 404
arriving where JSON was expected. `api.ts` turns that into an `UPSTREAM` error.
The root route uses a `redirect` rather than a `rewrite` because Vercel checks
the filesystem before rewrites, and `/` matches `index.html`.

Three things that had to be pinned, each of which cost a debugging session
(`docs/deploying-the-wall.md`):

- Root Directory must be the **repository root**, not `apps/web` — the web app
  depends on the unpublished `@mesa/election-core` workspace.
- `installCommand: "npm ci --include=dev"`, because Vercel sets
  `NODE_ENV=production`, npm then defaults to `omit=dev`, and `typescript` and
  `vite` are devDependencies → `tsc: command not found`.
- `rewrites` maps `/voting` → `/index.html`, `/wall` → `/wall.html` and
  everything else → `/index.html`, with a `(?!api/)` guard so a future
  serverless API is not silently swallowed.

Note that Vercel sends no `X-Frame-Options` at all. The deploying-the-wall doc
still says that's acceptable "because the ballot has no API … behind it there".
**That reasoning no longer holds now the ballot talks to Apps Script** (§21).

---

## 18. Election-day runbook

This runbook is for the **Express/laptop** deployment. For the Apps Script
deployment, follow *On the day* in `docs/apps-script-deployment.md`. There, to
close voting you set `status` to `closed` in `election.config.json`, run
`appsscript:build`, re-paste `Config.gs` and deploy a new version. Status is
compiled into the script, and no time window is enforced.

**Before**

1. Put the real roll in `apps/server/config/voters.json` and the real candidates
   in `election.config.json`; confirm `isSeedData` is absent.
2. `npm run gen:secrets`, fill `.env`, set `SPREADSHEET_MODE=sheets`.
3. `npm run sheets:check` → `npm run sheets:setup`.
4. `npm run preflight`.
5. Work through `docs/security-model.md §10`.
6. Rehearse: vote on a kiosk end-to-end, watch it land in the sheet, then
   `POST /api/admin/reset` with the election name to clear the practice ballots.
   The audit log survives that reset on purpose — so a count that vanished is
   provably a reset and not ballots going missing. The spreadsheet is cleared
   **first**; if Google is unreachable nothing local is touched.
7. Set the election `status` to `open` (and `opensAt`/`closesAt` if you want the
   window enforced).
8. Back up the database file; confirm you can restore it.

**During**

- Keep `/monitor` open at the desk. Use *Still to vote* near closing.
- Watch `/api/admin/sync/status` for outbox depth and dead letters;
  `npm run sheets:retry` requeues them. Votes are already safe either way.

**After**

- Set `status` to `closed`, `npm run results:publish`, download the CSV, and run
  `GET /api/admin/audit/verify` to prove the chain.
- Archive the SQLite file and its `-wal`.

---

## 19. Conventions and guardrails

If you are changing this code — human or AI — these are the rules the codebase
enforces on itself.

1. **Election behaviour comes from configuration, never from a branch on voter
   type.** `check:branching` will fail you. Presentational exceptions need
   `// eligibility-branch-ok: <reason>`.
2. **The server never trusts the client.** It re-reads the voter and re-runs
   validation against its own record. Do not add `voterId`/`voterType` to any
   request schema.
3. **Never add a voter reference to `ballots` or `ballot_selections`.** Ballot
   secrecy here is a property of the schema's *shape*, not of a policy.
4. **Never log selections or secrets to the audit log.** The repository throws;
   do not "fix" that by loosening it.
5. **Rate limits on voter-facing endpoints are keyed on the voter**, not the IP.
   A hall is one address.
6. **Wiring lives in `context.ts`.** No module-level singletons — every service
   must be constructible in isolation by a test.
7. **Copy with integrity weight lives in `lib/copy.ts` and is asserted
   verbatim.** Themed language never replaces plain language, on the client *or*
   the server.
8. **Vendored artwork is derived from a checksummed source**, never re-created
   by eye, and never fetches anything at runtime.
9. **Every `var(--x)` must resolve.** An undefined custom property is silent in
   the browser, invisible in jsdom tests, and has already cost this project a
   signature interaction.
10. **Nothing secret may be referenced from `apps/web`.** Only `VITE_*` crosses
    the boundary.
11. Run `npm run verify` before committing; `npm run preflight` before an
    election.
12. Prose in this repo — comments, docs, commit messages — explains **why**, not
    what. Several comments record a bug that actually happened; keep that style,
    and do not delete the archaeology.
13. **Commit subjects state the outcome as a plain sentence**, with no
    `feat:`/`fix:` prefix. For example: *"A tie prints both names, not #REF!"* or
    *"Counting the votes stops blocking the casting of them"*. The body explains
    the failure and why this fix.
14. **Election rules exist twice** (TypeScript and `.gs`). Change one, change
    the other, and run `npm run appsscript:verify`. Never hand-edit the generated
    `Config.gs` or `generated/election.ts`; edit `election.config.json` and
    regenerate.

---

## 20. Current state, known gaps, gotchas

Verified on **2026-09-23**, branch `main` @ `35632e2`, clean working tree.
`candidate-photos` has been merged; the aurora, wall, desk sign-in,
`ElectionReset`, `ResultsPublisher` and photo work are all on `main`.

- **Tests: 537 of 537 pass**, lint/branching/client-secrets/css-vars checks
  pass, and `appsscript:verify` passes.
- **The voter roll is public.** `apps-script/Config.gs` is committed with all
  145 real names and school email addresses, and
  `github.com/chaaandu/Forge-Student-Election` is a public repository. This
  undoes the reason `voters.json` is git-ignored. Removing the file now doesn't
  remove it from history. Decide whether to make the repo private or rewrite
  history, and whether `Config.gs` should be ignored with the roll left for the
  Roll tab to supply.
- **Closing the Apps Script election means a redeploy.** `castBallot_` checks
  `CONFIG.election.status`, which is compiled in; `opensAt`/`closesAt` aren't
  enforced there.
- **The Roll tab and `voters.json` drift.** Hand edits to the Roll tab are never
  copied back to the repository. Only matters if the election moves back to
  Express.
- **`VITE_APPS_SCRIPT_URL` is not in `.env.example`**; it is declared only in
  `apps/web/src/vite-env.d.ts`.
- **`README.md` is stale.** It quotes 319 tests in the banner and 244 in the
  command table, and doesn't mention the Apps Script backend or `/voting`.
  `docs/deploying-the-wall.md` still opens by saying the ballot can't work on
  Vercel; its routing section further down is current.
- A comment in `dashboard.gs` says it redraws "once a minute"; the trigger
  `setup.gs` installs runs every **five** minutes.
- **`postgres-migration` is an abandoned branch**, three commits ahead of an
  older `main`. It ports the server to Postgres and has unfinished tests. The
  last commit says the work was superseded by the Sheet-only approach and kept
  so it can be recovered. Don't merge it.
- **Secrets on disk at the root:** `.env` and a service-account key
  `forge-student-elections-*.json`. Both are git-ignored (`.gitignore:21`, `:32`);
  keep it that way.
- **A fresh clone has no voter roll** (git-ignored). Copy
  `apps/server/config/voters.sample.json`, or regenerate with `npm run data:build`
  if you hold the source files.
- **Known, accepted limits** (`docs/security-model.md §8`): an operator with file
  access can read the database; coerced voting is not solvable here; spreadsheet
  delivery is at-least-once; rate-limit state is per-process (it does not survive
  a restart or span replicas); and in `supervised` mode identity rests on the
  invigilator, not on software.

---

## 21. Open questions and next steps

Nothing in the repository settles these. They are listed so nobody assumes an
answer.

- **Which backend runs the real election?** Recent work (the Dashboard tab,
  personal links, Roll-tab editing, retry hardening) all targets Apps Script,
  and Vercel now sends `/` to the ballot. The README, the runbook in §18 and
  `docs/security-model.md` still describe the Express system.
- **Is the Apps Script trade-off accepted?** Editors of the Sheet can alter
  votes, there is no audit chain, and a running count is visible to everyone
  the Sheet is shared with. The Sheet's sharing list is now the security
  boundary.
- **Are personal links acceptable?** Anyone who has a link, or guesses a
  `voter_id` (ids follow `stu-first-last` / `emp-first-last`), can vote as that
  person on a public URL. The same is true of name search on that URL.
- **Frame headers on Vercel.** The ballot there now has a backend, but Vercel
  sends no `X-Frame-Options`/CSP. Add them in `vercel.json` `headers`, excluding
  `/paper` and `/noren`, which need `SAMEORIGIN`.
- **CI.** Nothing runs `verify` or `appsscript:verify` automatically. Adding
  `appsscript:verify` to `verify` is the cheapest guard against the two
  implementations drifting.
- Housekeeping: add `VITE_APPS_SCRIPT_URL` to `.env.example`, refresh
  `README.md`, fix the "once a minute" comment in `dashboard.gs`.

---

## 22. Further reading

| Document | What is in it |
| --- | --- |
| [`README.md`](README.md) | the public-facing overview |
| [`docs/architecture.md`](docs/architecture.md) | layering, the critical path step by step, concurrency, failure modes, seven ADRs |
| [`docs/product-spec.md`](docs/product-spec.md) | the journey screen by screen, requirements mapped to tests, fixed copy |
| [`docs/voting-logic.md`](docs/voting-logic.md) | eligibility, step sequences, validation, the weighting model, the zero-turnout decision |
| [`docs/security-model.md`](docs/security-model.md) | twenty threats → controls → tests, ballot secrecy and its limits, what is *not* protected, the pre-election checklist |
| [`docs/data-model.md`](docs/data-model.md) | configuration schema, SQL schema, retention, the workbook shape, how to add a position/house/voter type |
| [`docs/design-direction.md`](docs/design-direction.md) | "Vote / Form" — the Bauhaus grammar, the field-not-ink colour rule, house colour + form, gamification's one hard limit, and what was taken from open source |
| [`docs/google-sheets-setup.md`](docs/google-sheets-setup.md) | the six manual steps, with the failure messages |
| [`docs/apps-script-deployment.md`](docs/apps-script-deployment.md) | the hosted backend: why Apps Script, deploy steps, editing the Roll tab, personal links, clearing rehearsal votes, what it is weaker at |
| [`docs/deploying-the-wall.md`](docs/deploying-the-wall.md) | Vercel: the pinned settings, `/voting` · `/wall` routing, the frame-header caveat |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | the fifteen phases, sequencing rationale, risk register |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | dependency licences |
