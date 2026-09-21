# Implementation plan — Mesa Elections

Fifteen phases. Each has a **deliverable**, an **exit test** that can be run, and is sized so
that a broken phase can be discarded without unpicking the previous one. After every phase:
`npm run lint && npm run typecheck && npm run test && npm run build`.

Order is chosen so that **the rules are correct before anything renders**. The weighting
engine and ballot validator are finished and tested in Phase 2, before a single screen
exists — the opposite order is how election bugs get shipped behind a nice UI.

Progress is tracked here; `[x]` is only written once the exit test actually passes.

---

### Phase 1 — Architecture & project setup
**Deliver.** npm workspaces (`packages/election-core`, `apps/server`, `apps/web`); TypeScript
strict everywhere; ESLint flat config + Prettier; Vitest with per-workspace projects;
`.env.example`; `.gitignore`; the seven documents in `/docs`.
**Exit.** `npm run verify` passes on an empty project. Docs reviewed.

### Phase 2 — Domain core (`@mesa/election-core`)
**Deliver.** Types; Zod configuration schema with every rule from data-model.md §1.1;
`isEligible`; `buildSteps`; `validateBallot`; `calculateResults` with per-position effective
weights, both zero-turnout policies, competition ranking and tie detection.
**Exit.** The full test matrix in voting-logic.md §8 (weighting, eligibility, validation)
passes. Zero dependencies on React, Express or SQLite. This is the phase that must be right.

### Phase 3 — Persistence & repositories
**Deliver.** SQLite schema with CHECK constraints, immutability triggers and indexes; WAL +
`busy_timeout`; migration runner; `ElectionRepository`, `AuditRepository` (hash chain),
`OutboxRepository`; seed loader; `db:reset`.
**Exit.** Trigger tests prove ballots cannot be updated or deleted; audit chain verification
detects a tampered row.

### Phase 4 — Identity & sessions
**Deliver.** `IdentityProvider` interface + Dev, AccessCode (scrypt + pepper, lockout) and
Entra (auth-code + PKCE, Graph `/me`) implementations; opaque hashed sessions with TTL and
IP/UA binding; rate limiting; masked roll search.
**Exit.** Dev provider refuses to load under `NODE_ENV=production`; wrong codes lock out;
roll search never returns a full email; session binding mismatch revokes.

### Phase 5 — Voting service & one-vote enforcement
**Deliver.** `VotingService.submitBallot` as the single transaction from architecture.md §4;
server-side re-validation using the database's voter record; idempotency store; audit events.
**Exit.** `ballots.test.ts`, `security.test.ts` (forged type/id), `idempotency.test.ts`, and
`concurrency.test.ts` (worker threads, N simultaneous submissions → exactly one ballot).

### Phase 6 — HTTP API
**Deliver.** Express 5 app: `/api/election`, `/api/auth/*`, `/api/session`, `/api/ballots`,
`/api/admin/*`; strict Zod schemas; body caps; a single error mapper producing stable
machine codes + plain-language messages; structured logging with no secrets.
**Exit.** Route-level tests for every error in product-spec.md §7; no admin route reachable
with a voter session.

### Phase 7 — Design system
**Deliver.** Tokens from design-direction.md §2; Tailwind v4 `@theme`; self-hosted fonts;
`Button`, `TextField`, `Avatar`, `Tag`, `Dialog`, `ErrorState`, `Wordmark`.
**Exit.** The contrast test passes for every token pair *and* every configured house colour;
every control has a visible focus ring and a 44 px hit area.

### Phase 8 — The ink mark & paper surfaces
**Deliver.** `InkMark` (the drawn check), `Sheet`, and the WebGL `BallotSheet3D` for the
welcome screen, layered over a complete printed sheet rendered in HTML.
**Exit.** Tests: the mark is `aria-hidden` by default and takes a name when it stands alone;
reduced motion renders it fully drawn with no animation; filter ids are unique per instance.
Three.js is dynamically imported and absent from the application bundle; the welcome screen
is fully usable without it.

### Phase 9 — Flow state machine
**Deliver.** Reducer over `WELCOME → CHECK_IN → IDENTITY_CONFIRM → GATE[i] → REVIEW →
FINAL_CALL → SUBMITTING → DEPARTED`, with steps derived from `buildSteps`; edit-from-review
returns to review; history guard mapping browser Back onto `BACK`.
**Exit.** `machine.test.ts`: employee sequence has no house gate and totals 6; selections
survive back/forward; illegal transitions are rejected rather than silently allowed.

### Phase 10 — Welcome, check-in, identity
**Deliver.** Departure-hall welcome; provider-aware check-in (Entra button / search + code /
dev picker); boarding-pass identity confirmation; election-not-open and closed states.
**Exit.** Keyboard-only walkthrough to the first gate; search shows masked emails; empty
search result has a useful message.

### Phase 11 — Gates, candidates, house captains, review
**Deliver.** `CandidateCard` / `CandidateGrid` with roving-tabindex radiogroup;
`BallotProgress`; `PositionScreen`, using house colours for house contests; the review
ballot with per-row Edit, a perforation, and the verbatim warning copy.
**Exit.** Employee review has no house section at all; arrow keys move within a gate;
Continue explains why it is disabled; editing returns to review.

### Phase 12 — Submission, one-vote UX, error states
**Deliver.** Final-call dialog; idempotency key generated once per ballot; retry with the
same key; `DEPARTING` → `DEPARTED` driven only by a 2xx; 4 s celebration then full reset;
every error state from product-spec.md §7 with recovery actions.
**Exit.** `submission.test.tsx`: success never renders before the response resolves; a failed
submit returns to review with selections intact and an explicit "NOT recorded" message.

### Phase 13 — Excel integration
**Deliver.** `ExcelRepository` port; `GraphExcelRepository` (client-credentials, token cache,
workbook table row append, header-order discovery); `NullExcelRepository` writing JSONL for
development; `SyncWorker` with claim/backoff/dead-letter; `/api/admin/sync/status` + retry;
reconciliation report.
**Exit.** `sync.test.ts` with a fake Graph that fails, throttles (429 + `Retry-After`) and
recovers: no vote lost, no duplicate state machine, dead-letter surfaced.

### Phase 14 — Results & admin API
**Deliver.** `ResultsService` (aggregate query → `calculateResults`), turnout by type and by
house, CSV/JSON export, results push to the workbook, audit-chain verification endpoint.
**Exit.** End-to-end: seed → cast a known set of ballots → the printed table matches a
hand-computed expectation, including `Student-only (100%)` on house rows.

### Phase 15 — Hardening, polish, production readiness
**Deliver.** Secret checks at boot; the no-type-branching lint script; the client-secret
build scan; reduced-motion audit; image lazy-loading and dimension reservation; bundle check;
README; `.env.example`; deployment notes; pre-election checklist.
**Exit.** `npm run verify` green; a full manual run-through as a student and as an employee;
security-model.md §10 checklist executable.

---

## Sequencing rationale

- **Core before UI.** Phases 2–6 make the server authoritative and tested. If the project ran
  out of time at Phase 6, the election could still be run correctly with a crude interface;
  the reverse is not true.
- **Design system before screens** (7–8 before 10–12) so no screen invents its own spacing,
  colour or focus treatment.
- **State machine before screens** (9 before 10) so screens render states rather than
  managing them.
- **Excel late** (13) because it is a mirror. Nothing upstream depends on it, and building it
  early would have tempted a synchronous write.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Entra app registration not ready by election day | no production auth | access-code provider is fully implemented and tested as the fallback; the choice is one env var |
| Graph throttling during a burst of votes | workbook lags | outbox absorbs it; votes are already durable; 429 + `Retry-After` honoured |
| Candidate photos arrive late or oversized | slow gates | initials-avatar fallback; dimensions reserved; documented image budget |
| Voter roll changes on election morning | wrong electorate | roll reload is a restart with a validated file and an audit event; the count is printed |
| Zero-turnout policy is the wrong governance call | published percentages framed wrongly | default documented and flagged for confirmation (voting-logic.md §6.1); one config field, ranking unaffected |
| Kiosk left mid-ballot by a voter who walks away | next voter sees a stale session | 20-minute session TTL, plus an idle reset on the client |
| Single node fails on election day | outage | the whole state is one SQLite file; documented restore-from-backup drill and a spare machine |
