# Architecture — Mesa Elections

> Status: authoritative. Decisions marked **ADR-n** are recorded with rationale in
> [Architecture decisions](#architecture-decisions) and should not be reversed without
> updating this document.

## 1. What this system is

A single-election voting system for Mesa School of Business, run primarily on a small number
of shared kiosk machines in a hall, over a window of a few hours. It serves two electorates
(students and employees) whose votes are combined with configured weights, and it must
produce an auditable, tamper-evident result that is ultimately mirrored into an Excel
workbook the school already operates.

Scale is small (low hundreds of voters, single-digit concurrent sessions) but the
**integrity requirements are those of a real election**: one person one vote, ballot secrecy,
no silent vote loss, no trust in the client.

Low scale is a design input, not an excuse. It lets us pick a single-node, single-writer
data store and get serialisability for free instead of building distributed coordination.

## 2. Layering

Strict one-directional dependency. Nothing below knows about anything above it.

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation            apps/web  (React 19 + Vite + TW4)    │
│  screens, split-flap board, motion, a11y                     │
├──────────────────────────────────────────────────────────────┤
│ Election flow           apps/web/src/machine                 │
│  deterministic state machine over *eligible* positions       │
├──────────────────────────────────────────────────────────────┤
│ ── network boundary ── (nothing above here is trusted) ──────│
├──────────────────────────────────────────────────────────────┤
│ HTTP API                apps/server/src/http                 │
│  routing, authn/authz, rate limit, idempotency, error map    │
├──────────────────────────────────────────────────────────────┤
│ Services                apps/server/src/services             │
│  IdentityService · VotingService · ResultsService · SyncSvc  │
├──────────────────────────────────────────────────────────────┤
│ Domain (pure)           packages/election-core               │
│  config schema · eligibility · ballot validation · weighting │
├──────────────────────────────────────────────────────────────┤
│ Persistence             apps/server/src/db  (SQLite, WAL)    │
│  ElectionRepository · AuditRepository · OutboxRepository     │
├──────────────────────────────────────────────────────────────┤
│ Integration             apps/server/src/excel                │
│  ExcelRepository → GraphExcelRepository | NullExcelRepository │
└──────────────────────────────────────────────────────────────┘
```

`packages/election-core` has exactly one dependency (`zod`) and no I/O, no React, no Express,
no database. Every election rule lives there and is unit-testable in isolation. Both the
server and the browser import it — the browser for instant feedback, the server as the only
authority. **The same function produces both answers, so they can never disagree by accident,
but only the server's answer counts.**

## 3. Runtime topology

```
   Kiosk browser                     Node process (single)              Microsoft 365
 ┌───────────────┐   HTTPS   ┌──────────────────────────────┐        ┌──────────────┐
 │ apps/web SPA  │──────────▶│  Express API                 │        │  Graph API   │
 │               │◀──────────│    ├── SQLite (WAL) ◀── authoritative │              │
 └───────────────┘           │    └── Outbox worker ────────┼───────▶│  Workbook    │
         │                   │         (async, retrying)    │        │  tables      │
         └── Entra ID login ─┴──────────────────────────────┘        └──────────────┘
```

One process, one SQLite file, one background worker. No queue broker, no Redis, no second
database. Everything that must be atomic happens inside one SQLite transaction.

**Static assets** are served by the same Express process in production (`/` → `apps/web/dist`),
so a deployment is one container with one mounted volume for the database. That also removes
CORS and third-party-cookie questions entirely: same origin.

## 4. The critical path: casting a ballot

This is the only part of the system where correctness is non-negotiable, so it is described
exhaustively.

```
POST /api/ballots
  Authorization: Bearer <opaque session token>
  Idempotency-Key: <uuid generated once per ballot, before the first attempt>
  { "selections": { "president": "cand_x", ... } }

 1. Rate limit (per IP + per session).
 2. Resolve session token → hash → sessions row → voter_id.          ← identity comes from
    Reject if expired/revoked.                                          the DB, never the body
 3. BEGIN IMMEDIATE                     ← acquires the single writer lock: this whole block
                                          is serialised against every other writer
 4. Idempotency lookup by key.
      hit + completed  → COMMIT, replay stored response (200)
      hit + other voter→ ROLLBACK, 409 IDEMPOTENCY_KEY_REUSED
 5. Load voter row. Load election config. Assert election status == open and within window.
 6. Assert voter.has_voted == 0.
 7. validateBallot(config, voterFromDb, selections)   ← pure domain fn; rejects missing,
    any error → ROLLBACK, 422 with per-position detail   extra, inactive, mismatched,
                                                          and ineligible selections
 8. INSERT ballots           (no voter reference, ever)
 9. INSERT ballot_selections (one row per position)
10. INSERT vote_receipts(voter_id PRIMARY KEY)       ← hard DB uniqueness, independent of 6
11. UPDATE voters SET has_voted=1 WHERE id=? AND has_voted=0
    assert changes() == 1                            ← compare-and-swap, independent of 6
12. INSERT outbox rows (participation + anonymous ballot)
13. INSERT audit_log (hash-chained; no selections)
14. INSERT idempotency record with the response body
15. COMMIT                                            ← the vote is now durable and counted
16. Revoke session (single ballot per session).
17. Return 201 { status: "recorded", receiptId }
```

Steps 8–14 are one transaction. There is no state in which a ballot exists but the voter is
not marked as voted, or vice versa. Excel is *not* in this transaction (§6).

Three independent mechanisms each prevent a double vote: the `has_voted` read (6), the
primary key on `vote_receipts` (10), and the conditional update with a row-count assertion
(11). Any one of them suffices; the CAS at (11) is the one that holds under concurrency even
if the others were removed.

## 5. Concurrency model (ADR-3)

SQLite in WAL mode with `BEGIN IMMEDIATE` gives us **one writer at a time, serialised**.
Readers never block. For an election of this size this is strictly better than optimistic
concurrency over a networked database: the race window we are worried about does not exist,
because the conflicting transactions cannot interleave at all.

`busy_timeout` is set to 5000 ms so a competing writer waits rather than failing. The test
suite spawns real OS worker threads writing to the same database file to prove that N
simultaneous submissions for the same voter produce exactly one ballot
(`apps/server/src/services/__tests__/concurrency.test.ts`).

The naive pattern the brief warns about —

```ts
if (!hasVoted) { createBallot(); markVoted(); }   // WRONG
```

— is wrong because the check and the write are two statements. Here they are one transaction
*and* the write itself re-asserts the precondition (`WHERE has_voted = 0`), so the check is
not load-bearing.

## 6. The results spreadsheet: the outbox pattern (ADR-5)

The spreadsheet is a **downstream mirror, never the source of truth**. One port, three
implementations: **Google Sheets** (what Mesa uses, authenticated with a service account),
Excel via Microsoft Graph, and a local JSONL spool for development. Calling any of them
inside the ballot transaction would mean a vote is lost whenever the provider is slow,
rate-limits us, or the network blips — and it would hold the single writer lock for the
duration of an HTTP round-trip, serialising the entire election behind someone else's
latency.

Instead:

```
ballot tx ──▶ outbox (same transaction, so enqueue is atomic with the vote)
                 │
        SyncWorker (every SYNC_INTERVAL_MS)
                 │  claim → send → mark synced
                 ├─ transient failure → attempts++, exponential backoff + jitter, retry
                 ├─ permanent failure → status='failed', surfaced in /api/admin/sync/status
                 └─ never deletes the row; the authoritative record is already durable
```

Consequences we accept deliberately:

- A vote is **recorded** the moment the SQLite transaction commits. The voter sees success
  then, and that is honest: their vote is counted whether or not Excel ever responds.
- Excel can lag. `/api/admin/sync/status` reports pending/failed depth so the returning
  officer knows.
- If the workbook is unreachable for the whole election, results are still complete and
  exportable from the authoritative store; the sync drains afterwards.
- At-least-once delivery. A crash after Graph accepts a row but before we mark it synced
  causes a duplicate row in the workbook. We mitigate with a `dedupe_key` column written
  into the workbook and a reconciliation report; we do not claim exactly-once. See
  [data-model.md §7](./data-model.md#7-excel-workbook-shape).

## 7. Identity (ADR-2)

Identity is a **server-side binding**, established once per voter, per election:

```
IdentityProvider (interface)
 ├── EntraIdentityProvider   OAuth2 auth-code + PKCE against Microsoft Entra ID.
 │                           The email comes from Graph /me over a back-channel
 │                           exchange, so the browser cannot influence it. PRODUCTION.
 ├── AccessCodeProvider      Voter looks up their name, then enters a one-time code
 │                           handed out physically by the returning officer. The code
 │                           is stored only as a salted hash. KIOSK FALLBACK.
 └── SupervisedIdentityProvider
                             The voter selects their own name at a booth with a
                             Mesa employee present. No credential, by design:
                             identity is established by that person, as it is at
                             a polling station. Permitted in production.
                             WHAT MESA USES — see security-model.md §3.3.
```

Selecting a name in the UI is *navigation*, not authentication. The session token issued
after successful verification is what the ballot endpoint trusts, and it carries the
voter id server-side; the client never sends a voter id that the server believes.

Full threat analysis in [security-model.md](./security-model.md).

## 8. Ballot secrecy (ADR-4)

Two record families that are never joined:

| Participation (attributable)            | Ballot (anonymous)                        |
| --------------------------------------- | ----------------------------------------- |
| `voters.has_voted`, `voters.voted_at`   | `ballots`, `ballot_selections`             |
| `vote_receipts.voter_id`                | carries `voter_type` only — needed for     |
| answers *"did Chandu vote?"*             | weighting — and an hour-bucketed timestamp |
|                                         | answers *"what did the electorate choose?"*|

There is no column anywhere that links the two. Deliberately: the schema makes the
"who voted for whom" query unwritable rather than merely forbidden.

Residual risk (insertion-order correlation) and its mitigations are documented honestly in
[security-model.md §6](./security-model.md#6-ballot-secrecy-and-its-limits).

## 9. Configuration as data (ADR-1)

Nothing about *this* election is in the code. `election.config.json` defines the election,
its weights, houses, positions, candidates and the voter roll; it is validated by a Zod
schema on load, and the server refuses to start if it is invalid. Position eligibility is
declarative:

```jsonc
{ "id": "president",             "eligibility": { "voterTypes": ["student", "employee"] } },
{ "id": "house-captain-aravalli","eligibility": { "voterTypes": ["student"],
                                                  "houseId": "aravalli" } }
```

The step engine, progress indicator, review screen, ballot validator, and results weighting
**all derive from this one field**. There is no `if (voter.type === 'employee')` anywhere in
the system — searching for that pattern is part of the review checklist.

## 10. Results

`ResultsService` reads aggregate tallies (`GROUP BY position_id, candidate_id, voter_type`)
and hands them to the pure `calculateResults()` in election-core. Results are never exposed
to voters, never computed in the browser, and require an admin token. Weighting rules —
including per-position renormalisation when only one voter type is eligible — are specified
in [voting-logic.md](./voting-logic.md).

## 11. Failure modes and what the voter sees

| Failure                         | System behaviour                                    | Voter sees                                  |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| Network drops mid-flow          | selections held in memory + sessionStorage          | "DELAYED — your selections are safe", retry |
| Submission request times out    | idempotency key makes retry safe                    | automatic retry, then manual retry button   |
| Server 5xx on submit            | nothing committed, nothing lost                     | explicit "your vote was NOT recorded"       |
| Voter already voted             | 409 before any write                                | "ALREADY DEPARTED" + what to do             |
| Graph/Excel down                | outbox retries; vote already durable                | nothing — it is not their problem           |
| Election closed mid-session     | 409 at submit                                       | "GATE CLOSED" with the closing time         |
| Kiosk browser closed mid-ballot | session expires in 20 min; no ballot exists         | fresh welcome screen for the next voter     |

The success screen is **never** shown on a timer — only on a 2xx from the server (§ theme
rules in [design-direction.md](./design-direction.md)).

## 12. Architecture decisions

**ADR-1 — Configuration over code.** *Decision:* the entire election is a validated JSON
document; code contains no candidate, house, position or count. *Why:* the brief requires
re-running the election next year without code changes, and hard-coded rules are how
election bugs happen. *Cost:* a validation layer and richer types. *Accepted.*

**ADR-2 — Identity is a pluggable port; Mesa chose physical supervision.** *Decision:*
authentication is an interface with three implementations — Entra ID, printed access codes,
and supervised booth selection. Mesa runs `supervised`: the voter picks their own name in a
room with an employee present. *Why:* the requirement is that the *system* must not rely on
front-end identity selection as a security mechanism, and it does not — the session is
server-issued and the ballot endpoint reads the voter from that session, never from the
request body, so a manipulated client still cannot vote twice or vote for a position it is
not entitled to. What identity *means* is an operational question, and for a single
supervised room an invigilator who knows the students is a stronger and cheaper control than
distributing 128 credentials. *What is given up:* software cannot detect a voter selecting an
absent classmate's name. *Mitigated by:* already-voted marks in roll search, a large
confirmation screen, and a live `/monitor` view for reconciliation. *Reversible:* one
environment variable switches to `access-code` or `entra`, both fully tested. *Accepted, with
the trade documented in security-model.md §3.3.*

**ADR-8 — An invigilator monitor, served outside the voting SPA.** *Decision:* `/monitor` is
a self-contained page served by the API, gated by the admin token, polling
`/api/admin/monitor`. *Why:* the people running the room need to see who has voted and chase
who has not; putting that inside the voter SPA would make it reachable from a booth by
navigating the flow. It reports participation only — no query anywhere in the system can
reveal how a person voted. *Accepted.*

**ADR-3 — SQLite (WAL) as the authoritative store.** *Decision:* single-node SQLite with
`BEGIN IMMEDIATE` transactions. *Why:* the strongest available isolation (serialised writers)
with zero operational surface, and it makes the one-vote guarantee provable rather than
probabilistic. *Alternative rejected:* Postgres — correct but adds an operational dependency
for ~150 voters; the design keeps `ElectionRepository` as a port so this is a contained swap.
*Cost:* no horizontal scaling; documented as an explicit non-goal. *Accepted.*

**ADR-4 — Structural ballot secrecy.** *Decision:* no foreign key from ballots to voters,
anywhere. *Why:* privacy guaranteed by schema shape survives future careless code; privacy
guaranteed by policy does not. *Cost:* we cannot answer "re-issue this voter's ballot" —
which is the correct behaviour for an election anyway. *Accepted.*

**ADR-5 — Outbox for Excel, not synchronous writes.** *Decision:* ballots commit locally,
then sync asynchronously with retries. *Why:* "a vote must not be silently lost" and "the
user must not see a fake success" are both satisfiable only if the authoritative write is
local and complete before we answer. *Cost:* at-least-once delivery to the workbook.
*Accepted with a documented reconciliation step.*

**ADR-6 — No client-side router.** *Decision:* the flow is a reducer-driven state machine,
not URL routes. *Why:* URLs are user-editable state; a voter must not be able to type
`/review` and skip gates, and back/forward must mean *ballot* back/forward. The browser Back
button is intercepted via a history guard so it maps onto the machine's `BACK` transition.
*Accepted.*

**ADR-7 — Port the React Bits split-flap rather than depend on it.** *Decision:* React Bits'
`SplitFlapText` is the right mechanic but is copy-in JSX with no accessibility layer and a
self-driving word cycle. We re-implemented it in TypeScript as a controlled component with a
visually-hidden real-text layer, `aria-hidden` flaps, reduced-motion short-circuit, and
injectable timing for tests. Attribution in `THIRD_PARTY_NOTICES.md`. *Why:* the theme's
signature element must be accessible and driven by real application state, never a timer.
*Accepted.*

## 13. Non-goals

Multi-tenant elections · horizontal scaling · offline ballot casting · ranked-choice or
approval voting · an admin UI in this release (the service boundary and API exist for one) ·
end-to-end verifiable cryptographic voting (out of proportion for a school election; the
honest limits are stated rather than papered over).
