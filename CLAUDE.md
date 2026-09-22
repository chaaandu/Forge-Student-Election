# CLAUDE.md — the whole project, in one file

> **Read this first.** It is the orientation document for anyone new to this
> repository — a person or an AI assistant. It explains what the system is, how
> it is put together, why the unusual decisions were made, how to run it, and
> what will bite you. Everything here was verified against the code on
> 2026-09-22; where a detail lives in a deeper document, the link is given.

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
21. [Further reading](#21-further-reading)

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

| | |
| --- | --- |
| Repo name | `mesa-elections` (npm workspaces monorepo) |
| Git remote | `https://github.com/chaaandu/Forge-Student-Election.git` |
| Runtime | Node **22+** (developed on 24), npm 10+ |
| Server | Express 5 + better-sqlite3 (WAL) + zod |
| Web | React 19 + Vite 7 + Tailwind 4 + ogl/three (artwork only) |
| Domain core | `packages/election-core` — pure TypeScript, one dependency (zod) |
| Tests | Vitest, 3 projects (`core`, `server`, `web`), 39 files / 524 tests |
| Live election data | 10 positions · 4 houses · 25 candidates · 145 voters (119 students, 26 employees) |
| Auth mode in use | `supervised` (voter picks their own name with an invigilator present) |
| Spreadsheet mirror | Google Sheets via a service account |

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

The voter roll (`apps/server/config/voters.json`) is **git-ignored** because it
contains 145 real names and school email addresses. A fresh clone therefore has
no roll. Use `apps/server/config/voters.sample.json`, or regenerate the real one
with `npm run data:build` (needs the source spreadsheet/PDF, also git-ignored).

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
      scripts/                seed · reset · genSecrets
  web/                        React 19 + Vite. Presentation and flow only.
    src/
      machine/                the voting state machine (contains no election rules)
      screens/                Welcome · CheckIn · IdentityConfirm · Position · Review ·
                              Submitting · Done · SpeechesWall
      components/             bauhaus/ · election/ · ui/ · backdrop/ · ink/ · noren/ · paper/
      lib/                    api · color · copy · ground · voterType · candidatePhoto · webgl
      styles/                 tokens.css · global.css · wall.css · fonts.css
      assets/candidates/      imported, cropped, compressed candidate photos (committed)
    public/                   candidates/*.svg placeholders · houses/*.png · paper/ · noren/
    vendor/threeui/           vendored ThreeUI sources + SOURCE.json checksums
    wall.html / src/wall.tsx  the projected speeches wall — a second entry point
packages/election-core/       Pure domain: types · config schema · eligibility · steps ·
                              validation · results (weighting). No I/O, no framework.
docs/                         Nine deep documents (see §21)
scripts/                      Build/import/verify tooling (see §15)
assets/                       Drop zones: candidate-photos/ (ignored), house-logos/ (committed)
```

**Dependency direction is strictly one-way.** `election-core` knows nothing
about HTTP, React or SQLite. Both the browser and the server import it — the
browser for instant feedback, the server as the only answer that counts.

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

`npm run gen:secrets` prints a ready-to-paste block of fresh secrets.

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
| `npm run data:build` | rebuild `election.config.json` + `voters.json` from the source PDF/XLSX |
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
```

The server project runs with `fileParallelism: false` — the election database is
a single writer by design, and tests that exercise concurrency spawn their own
processes rather than relying on the runner.

| Suite | Covers |
| --- | --- |
| `core` | weighting including both zero-turnout policies, ties, unknown candidates, config validation, eligibility, step sequences, ballot validation |
| `server` | one-vote enforcement, **eight-process concurrency**, idempotency, forged payloads, roll masking, admin authz, audit-chain tampering, immutability triggers, Sheets auth/errors/header-ordering, spreadsheet failure/throttle/recovery, the monitor, the results publisher, the wall routing, server copy voice, end-to-end weighted results, shared-kiosk rate limits |
| `web` | the state machine, the colour system, ink-mark and button accessibility contracts, measured token and house-colour contrast, the candidate-photo pipeline, and full student and employee journeys through the real UI |

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
NODE_ENV=production node apps/server/dist/main.js
```

In production the API serves the built SPA from the same origin, so a deployment
is one Node process and one mounted volume for `DATABASE_PATH`. Same-origin
removes CORS and third-party-cookie questions entirely. Terminate TLS in front
and enable HSTS.

**Back up `DATABASE_PATH` and its `-wal` file on a schedule, and rehearse a
restore before election day.** The whole election is that one file.

### Vercel — the wall only

`vercel.json` deploys `apps/web` as a static build. **The wall works there; the
ballot renders but every check-in fails**, because there is no `/api`. Point a
projector at it, not a booth.

Three things that had to be pinned, each of which cost a debugging session
(`docs/deploying-the-wall.md`):

- Root Directory must be the **repository root**, not `apps/web` — the web app
  depends on the unpublished `@mesa/election-core` workspace.
- `installCommand: "npm ci --include=dev"`, because Vercel sets
  `NODE_ENV=production`, npm then defaults to `omit=dev`, and `typescript` and
  `vite` are devDependencies → `tsc: command not found`.
- `rewrites` maps `/wall` → `/wall.html` and everything else → `/index.html`,
  with a `(?!api/)` guard so a future serverless API is not silently swallowed.

Note that Vercel sends no `X-Frame-Options` at all. That is acceptable only
because the ballot has no API, session or data behind it there. **If an API is
ever added to that deployment, the header rules have to come with it.**

---

## 18. Election-day runbook

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

---

## 20. Current state, known gaps, gotchas

Verified on **2026-09-22**, branch `candidate-photos`.

- **Tests: 523 of 524 pass.** The one failure is
  `apps/server/src/__tests__/monitor.test.ts:35`, which still asserts the string
  `Admin token` on the monitor page. The page was rebuilt around the new
  email + password desk sign-in (§9) and now reads *Election desk*. The test is
  stale, not the code — fix the assertion.
- **`npm run monitor:password` does not exist.** `apps/server/src/config/env.ts`
  tells you to run it to generate `MONITOR_PASSWORD_HASH`, but no such script is
  defined. Until one is added, call `hashPassword()` from
  `apps/server/src/services/adminAuth.ts` directly, e.g.
  `npx tsx -e "import {hashPassword} from './apps/server/src/services/adminAuth.ts'; console.log(hashPassword('...'))"`.
- **`README.md` quotes stale test counts** (319 in the banner, 244 in the command
  table). The real figure is above.
- **The branch has a large uncommitted working tree** — the aurora backdrop, the
  speeches wall, the desk sign-in, `ElectionReset`, `ResultsPublisher` and the
  candidate-photo work. Check `git status` before assuming what is on `main`.
- **A fresh clone has no voter roll** (git-ignored). Copy
  `apps/server/config/voters.sample.json`, or regenerate with `npm run data:build`
  if you hold the source files.
- **Known, accepted limits** (`docs/security-model.md §8`): an operator with file
  access can read the database; coerced voting is not solvable here; spreadsheet
  delivery is at-least-once; rate-limit state is per-process (it does not survive
  a restart or span replicas); and in `supervised` mode identity rests on the
  invigilator, not on software.

---

## 21. Further reading

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
| [`docs/deploying-the-wall.md`](docs/deploying-the-wall.md) | Vercel, and why the ballot cannot go there |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | the fifteen phases, sequencing rationale, risk register |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | dependency licences |
