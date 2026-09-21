# Security model — Mesa Elections

This document states **what is actually protected, by which mechanism, and what is not**.
Claims are mapped to code and tests. Nothing here says "the system is secure"; that is not a
statement anyone can make without saying against whom.

## 1. Trust boundaries

```
 UNTRUSTED                       │ TRUSTED                        │ SECRET
 ────────────────────────────────┼────────────────────────────────┼──────────────────
 the browser, all request bodies │ the Node process               │ env vars
 headers, URL params, localStorage│ the SQLite file               │ Graph client secret
 anything a voter can type/edit  │ election.config.json (reviewed)│ ADMIN_API_TOKEN
                                 │                                │ ACCESS_CODE_PEPPER
                                 │                                │ SESSION/IP hash salts
```

**Rule applied everywhere:** a value that crosses from untrusted into trusted is either
validated against a Zod schema or discarded. The request body of `POST /api/ballots` is
exactly `{ selections: Record<string,string> }` — anything else is stripped by the schema,
and `voterId` / `voterType` in the body are *never read*, not even to compare.

## 2. Threats and controls

| # | Threat | Control | Where | Test |
| --- | --- | --- | --- | --- |
| T1 | Voting twice | one transaction containing: `has_voted` check, `vote_receipts` PRIMARY KEY, and `UPDATE … WHERE has_voted=0` with a row-count assertion | `VotingService.submitBallot` | `ballots.test.ts` |
| T2 | Two simultaneous submissions | `BEGIN IMMEDIATE` on WAL SQLite = serialised writers; the CAS re-asserts the precondition inside the lock | same | `concurrency.test.ts` (real worker threads) |
| T3 | Double-click / retried request | `Idempotency-Key` required; completed responses replayed verbatim; key bound to voter and request hash | `idempotency.ts` | `idempotency.test.ts` |
| T4 | Impersonating another voter | identity established server-side (Entra back-channel or one-time code); the client never asserts who it is | `IdentityService` | `security.test.ts` |
| T5 | Forging `voterType` to change vote weight | voter type is read from the database row; the field is absent from the request schema | `VotingService` | `security.test.ts` |
| T6 | Employee voting for house captains | eligibility computed from the server's voter record; extra selections reject the whole ballot | `validateBallot` | `validation.test.ts`, `ballots.test.ts` |
| T7 | Voting for a withdrawn/inactive candidate | candidate must exist, be `active`, and belong to that position | `validateBallot` | `validation.test.ts` |
| T8 | Submitting an incomplete ballot | server re-validates completeness; client validation is convenience only | `validateBallot` | `validation.test.ts` |
| T9 | Replaying a captured submission | session token is single-use for a ballot and revoked on success; idempotency key already consumed | `VotingService` | `security.test.ts` |
| T10 | Stealing a session token | opaque 256-bit token, SHA-256 at rest, 20-minute TTL, bound to IP-hash + UA-hash, `Bearer` only (never a cookie, so CSRF is structurally impossible) | `sessions.ts` | `sessions.test.ts` |
| T11 | Brute-forcing access codes | 6 chars from a 32-symbol Crockford alphabet (~10^9), scrypt + per-voter salt + global pepper, constant-time compare, 5 attempts then a 15-minute lock, plus IP rate limit | `AccessCodeProvider` | `accesscode.test.ts` |
| T12 | Harvesting the voter roll (names + emails) | search requires a kiosk token, min 2 chars, max 8 results, emails masked (`ch•••@mesa.edu`), rate-limited per IP; the full roll is never sent to the browser | `routes/auth.ts` | `roll.test.ts` |
| T13 | Reading results early / at all | admin routes require `ADMIN_API_TOKEN` compared in constant time; no results endpoint is reachable with a voter session | `requireAdmin` | `admin.test.ts` |
| T14 | Tampering with stored ballots | `BEFORE UPDATE`/`BEFORE DELETE` triggers abort; hash-chained audit log detects history edits | `schema.sql` | `immutability.test.ts` |
| T15 | Tampering with candidates/voters mid-election | configuration is loaded once at boot and hashed; `config_version` is stamped on every ballot; a changed file mid-election is visible in the audit log | `configStore.ts` | `config.test.ts` |
| T16 | Leaking secrets to the browser | only `VITE_`-prefixed variables reach the bundle; a build-time check fails the build if a non-`VITE_` secret name appears in `apps/web` | `scripts/check-client-secrets.mjs` | CI |
| T17 | Losing votes when Excel is down | the vote commits locally before the response; Excel sync is an outbox with retries | `SyncWorker` | `sync.test.ts` |
| T18 | Accidental destruction of the database | immutability triggers, WAL + checkpoint, documented backup procedure, reset script refuses to run with `NODE_ENV=production` | `scripts/reset.ts` | `reset.test.ts` |
| T19 | Request flooding / accidental self-DoS | token-bucket rate limits: 30/min per IP globally, 10/min on lookup, 5/15min on code verification, 5/min on submission | `rateLimit.ts` | `ratelimit.test.ts` |
| T20 | Oversized or malformed payloads | 16 KB JSON body cap, strict schemas, selections object capped at the number of configured positions | `http/app.ts` | `security.test.ts` |

## 3. Identity and authentication

Front-end name selection is **navigation, not authentication**. Three providers implement
`IdentityProvider`; exactly one is active, chosen by `AUTH_MODE`.

### 3.1 `entra` — production recommendation

OAuth 2.0 authorization-code flow with PKCE against Microsoft Entra ID.

1. `GET /api/auth/entra/start` → server generates `state` + PKCE verifier, stores them in an
   `auth_requests` row (10-minute TTL, single use), redirects to Microsoft.
2. Voter authenticates with their Mesa account — including whatever MFA the tenant enforces.
3. `GET /api/auth/entra/callback?code&state` → server validates `state`, exchanges the code
   **server-to-server** (client secret never leaves the server), then calls Graph `/me` with
   the resulting access token.
4. The email comes from that back-channel response. The browser cannot influence it, so
   there is no token for the client to forge — this is why we call Graph rather than parsing
   an `id_token` in the SPA.
5. Email is matched case-insensitively against `voters.email_norm`. No match → a clear
   "you are not on the roll" screen and an audit event. Match → session issued.

Impersonation then requires the victim's Mesa credentials, which is the school's existing
identity boundary rather than one we invented.

### 3.2 `access-code` — kiosk fallback

For a hall of shared machines where per-student login is impractical. Each voter gets a
printed slip with a 6-character code, handed over in person against a student ID.

Codes are generated once by `npm run seed -- --codes`, printed, and stored **only** as
`scrypt(code, per-voter salt, global pepper)`. The plaintext exists in one generated PDF/CSV
that is not committed and is destroyed after distribution. The system cannot tell a voter
their own code — it can only re-issue a new one, which is the correct property.

Security: ~10^9 code space, 5 attempts then a 15-minute per-voter lock, an IP rate limit, and
constant-time comparison. Residual risk: a code slip can be stolen or handed over. This is
the same class of risk as a paper ballot paper and is managed procedurally (ID check at
handout). **Stated plainly: this mode is weaker than Entra and is a deliberate trade for
kiosk practicality.**

### 3.3 `dev`

Pick any voter, no proof. `loadIdentityProvider()` throws at boot if
`NODE_ENV === 'production'`, and the UI shows a permanent red banner. It exists so that
development and tests never need real credentials.

### 3.4 Sessions

256-bit random token, returned once, stored as SHA-256. 20-minute TTL. Bound to a salted
hash of IP and user-agent; a mismatch revokes the session and audits it. Revoked immediately
after a successful ballot — a session buys exactly one ballot. Sent as
`Authorization: Bearer`, never as a cookie, which removes CSRF from the threat model by
construction.

## 4. Authorization

| Route group | Requirement |
| --- | --- |
| `GET /api/election` | none — public, and contains only active candidates, positions, houses. No voters. |
| `POST /api/auth/lookup` | kiosk token (`KIOSK_TOKEN`), rate-limited, masked output |
| `POST /api/auth/verify`, `/entra/*` | rate-limited |
| `GET /api/session`, `POST /api/ballots` | valid, unexpired, unrevoked session |
| `/api/admin/*` | `ADMIN_API_TOKEN`, constant-time compare, every call audited |

There is no route by which a voter session can read another voter's data, any ballot, or any
result.

## 5. Input validation

Every boundary is a Zod schema; nothing is hand-parsed.

- **HTTP bodies** — strict schemas, unknown keys stripped, 16 KB cap.
- **Configuration** — [data-model.md §1.1](./data-model.md#11-validation-rules-enforced-at-load).
  Invalid config = refuse to boot.
- **Excel/API-sourced voter and candidate data** — the same schemas. Missing email,
  malformed type, duplicate id, `javascript:` photo URL, and orphan `positionId` are all
  rejected at the boundary with the offending row identified. External data is treated
  exactly as hostile as a browser request.
- **Photo URLs** — must be root-relative or `https:`; anything else is dropped and the card
  falls back to an initials avatar.

## 6. Ballot secrecy and its limits

**What holds.** No column links a voter to a ballot. Participation and content live in
tables that share no key. Results are aggregates. `voter_type` is on the ballot because
weighting is impossible without it — it narrows the anonymity set to "one of ~118 students"
or "one of ~20 employees", which is the minimum disclosure the business rule requires.
Ballot timestamps are coarsened to the hour, and ballot ids are random UUIDs rather than a
sequence.

**What does not hold — stated honestly:**

1. **Insertion-order correlation.** Anyone with raw read access to the database file can
   compare SQLite `rowid` ordering in `ballots` against `voters.voted_at` and reconstruct
   who cast which ballot. *Mitigations:* hour-bucketed ballot timestamps, random ids, no API
   that exposes ballot order or per-ballot rows (admin endpoints return aggregates only),
   and file access restricted to the returning officer. *Not mitigated:* the returning
   officer, or anyone who obtains the file, can do this. Eliminating it requires either
   re-keying ballots in a shuffle at close or a cryptographic voting scheme; both are out of
   proportion here. **The returning officer is a trusted role in this design, and that trust
   is a deliberate, documented choice, not an oversight.**
2. **Small anonymity sets.** With ~20 employees, a house captain contest of ~30 students, or
   an unusual combination of selections, statistical de-anonymisation is possible in
   principle. This is inherent to a small electorate, not to this implementation.
3. **Shoulder surfing.** A shared kiosk in a hall is observable. Partly mitigated by never
   displaying selections after submission and resetting fully between voters; the rest is
   physical layout, which is the school's to arrange.

## 7. Audit log

Append-only, hash-chained (`hash = sha256(prev_hash ‖ canonical(row))`), verified by
`GET /api/admin/audit/verify`.

Events: `SESSION_STARTED` · `IDENTITY_VERIFIED` · `IDENTITY_FAILED` · `VOTER_NOT_ON_ROLL` ·
`ACCESS_CODE_LOCKED` · `BALLOT_SUBMITTED` · `BALLOT_REJECTED` · `DUPLICATE_VOTE_ATTEMPT` ·
`IDEMPOTENT_REPLAY` · `SESSION_BINDING_MISMATCH` · `ELECTION_CONFIG_LOADED` ·
`RESULTS_GENERATED` · `ADMIN_ACCESS` · `SYNC_FAILED` · `SYNC_DEAD_LETTERED`.

**What is never logged:** ballot selections (not in any event, at any level), access codes,
session tokens, the admin token, Graph secrets, raw IPs, or raw user agents. IP and UA are
stored only as salted hashes. `BALLOT_SUBMITTED` records that voter X voted at time T — a
public fact in an election — and the ballot id is deliberately *not* in the same row.

There is one genuine tension: `BALLOT_SUBMITTED` gives an accurate `voted_at`, which feeds
the correlation risk in §6.1. We keep it because an election must be able to prove who
participated. The trade is recorded here rather than hidden.

## 8. What is *not* protected

Said plainly, because a security document that only lists wins is marketing:

- **An operator with file access** can read the database, correlate ordering (§6.1), drop
  the immutability triggers, or replace the configuration. There is no defence against the
  administrator inside a single-node design. Controls are procedural: restricted access,
  the hash-chained audit log making edits *detectable*, and off-box backups.
- **Coerced voting.** Nothing prevents someone standing over a voter. Unsolvable in any
  remote/kiosk system; a polling-booth layout problem.
- **Access-code handover.** A voter can give their slip away (§3.2). Entra mode removes this.
- **Exactly-once Excel delivery.** At-least-once with a `dedupe_key` and a reconciliation
  report. Duplicates in the workbook are possible after a crash at the wrong instant; the
  authoritative count is never affected.
- **Denial of service by someone on the network.** Rate limits protect against accidents and
  casual abuse. A determined attacker on the LAN can disrupt availability; the mitigation is
  operational (the election is a supervised in-person event on a controlled network).
- **Rate-limit state is per-process.** Correct for the single-node deployment; a shared store
  would be required if the API were ever scaled out.
- **Compromise of the kiosk machine itself** (keylogger, malicious extension). Out of scope;
  managed devices are assumed.

## 9. Secrets handling

Secrets live in environment variables, are read once at boot, and never appear in logs,
responses, or error messages. `.env` is git-ignored; `.env.example` carries placeholders
only. The web bundle can only ever contain `VITE_`-prefixed values, and a build-time scan
(`scripts/check-client-secrets.mjs`) fails the build if a secret-shaped name appears in
`apps/web`. The server refuses to start in production when `ADMIN_API_TOKEN` is missing,
shorter than 32 characters, or equal to the example value; the same applies to
`ACCESS_CODE_PEPPER` and `HASH_SALT`.

## 10. Pre-election checklist

- [ ] `AUTH_MODE` is `entra` or `access-code`. **Never `dev`.**
- [ ] `NODE_ENV=production`; the server confirms it refused the dev provider.
- [ ] `ADMIN_API_TOKEN`, `ACCESS_CODE_PEPPER`, `HASH_SALT`, `KIOSK_TOKEN` are freshly
      generated (`npm run gen:secrets`) and ≥ 32 chars.
- [ ] TLS terminated in front of the app; HSTS on.
- [ ] `election.config.json` reviewed and signed off; `configHash` recorded in the log.
- [ ] Voter roll reconciled against the registry; count recorded.
- [ ] Seed/demo data absent (`npm run verify:no-seed` passes).
- [ ] Database file on persistent storage; backup cron verified by a restore rehearsal.
- [ ] `/api/admin/sync/status` reachable and green.
- [ ] Access-code slips printed, distributed against ID, plaintext file destroyed.
- [ ] A dry run completed end-to-end on a test election id, then `npm run db:reset`.
- [ ] Returning officer briefed on every error screen in
      [product-spec.md §7](./product-spec.md#7-copy-reference).
