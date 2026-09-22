# Voting logic — Mesa Elections

Everything in this document is implemented in `packages/election-core`, which has no I/O and
no framework dependency. Section numbers map to source files:

| Section | Source |
| --- | --- |
| §2 Eligibility | `src/eligibility.ts` |
| §3 Step sequence | `src/steps.ts` |
| §4 Ballot validation | `src/validation.ts` |
| §5–§7 Weighting & results | `src/results.ts` |

## 1. Vocabulary

- **Position** — a contest (President, House Captain of Aravalli). Has exactly one winner.
- **Eligibility** — which voters may vote *in* a position. A property of the position, not a
  branch in the code.
- **Selection** — one voter's choice in one position.
- **Ballot** — the complete set of selections a voter submits, atomically.
- **Electorate of a position** — the voters eligible for it. Different positions have
  different electorates; this is the core idea that everything else falls out of.

## 2. Eligibility

Every position declares its own electorate:

```ts
type Eligibility = {
  voterTypes: VoterType[];   // non-empty
  houseId?: string;          // if present, restricts to members of that house
};
```

The single predicate used by *every* layer:

```ts
export function isEligible(voter: Voter, position: Position): boolean {
  if (!position.eligibility.voterTypes.includes(voter.type)) return false;
  if (position.eligibility.houseId !== undefined &&
      voter.houseId !== position.eligibility.houseId) return false;
  return true;
}
```

Current configuration:

| Position | `voterTypes` | `houseId` | Electorate |
| --- | --- | --- | --- |
| President | student, employee | — | everyone |
| Vice President | student, employee | — | everyone |
| Boys’ Academic Lead | student, employee | — | everyone |
| Girls’ Academic Lead | student, employee | — | everyone |
| Boys’ Community Lead | student, employee | — | everyone |
| Girls’ Community Lead | student, employee | — | everyone |
| *each house* House Captain | student | that house | students of that house |

Consequences that are *derived, never special-cased*:

- An employee's sequence is the six leadership gates. The House Captains step does not
  exist for them — it is not hidden, disabled, or skipped.
- A student votes in exactly **one** house-captain contest: their own. They do not vote for
  other houses' captains.
- There is no `if (voter.type === 'employee')` in the codebase. `npm run lint` includes a
  custom check (`scripts/check-no-type-branching.mjs`) that fails the build if one appears
  outside `election-core`'s eligibility module and the seed data.

## 3. Step sequence

```ts
export function buildSteps(config: ElectionConfig, voter: Voter): Position[] {
  return config.positions
    .filter((p) => isEligible(voter, p))
    .sort((a, b) => a.order - b.order);
}
```

`steps.length` is the progress denominator. An employee is never shown `6 / 10`; they are
shown `6 / 6`. If a student's house has no configured captain position, their sequence is
simply six — the system degrades correctly rather than erroring.

The flow state machine's transitions are a function of this array:

```
WELCOME → CHECK_IN → IDENTITY_CONFIRM
                         │
                         ├── student  → GATE[0..6]  (6 leadership + 1 own-house captain)
                         └── employee → GATE[0..5]  (6 leadership)
                                          │
                                          ▼
                    REVIEW ⇄ (edit → GATE[i] → REVIEW) → FINAL_CALL
                                          │
                                          ▼
                     SUBMITTING ──(2xx)──▶ DEPARTED ──(3–5s)──▶ WELCOME
                          │
                          └──(4xx/5xx/offline)──▶ ERROR ──▶ REVIEW (selections intact)
```

## 4. Ballot validation

The same function runs in the browser (for instant feedback) and on the server (as the
authority). The server calls it with the voter record **it** loaded from the database, never
with anything from the request body.

```ts
validateBallot(config, voter, selections): ValidationResult
```

A ballot is valid **iff** the set of selected position ids is *exactly* the set of positions
the voter is eligible for, and every selection names an active candidate registered for that
position.

| Code | Condition | Server response |
| --- | --- | --- |
| `MISSING_SELECTION` | an eligible position has no selection | 422 |
| `INELIGIBLE_POSITION` | a selection names a position the voter may not vote in | 422 |
| `UNKNOWN_POSITION` | a selection names a position not in the configuration | 422 |
| `UNKNOWN_CANDIDATE` | candidate id not in the configuration | 422 |
| `INACTIVE_CANDIDATE` | candidate exists but `active: false` | 422 |
| `CANDIDATE_POSITION_MISMATCH` | candidate is registered for a different position | 422 |
| `DUPLICATE_SELECTION` | the same candidate appears under two positions | 422 |

### 4.1 Extra selections are fatal, never trimmed

If an employee's submission contains a House Captain selection, the **entire ballot is
rejected** with `INELIGIBLE_POSITION`. We do not strip the extra entries and accept the rest.

The reasoning is not pedantry. A payload with extra fields is either a client bug or
manipulation. Silently accepting the remainder records a vote the voter may not have
intended, hides the bug, and gives an attacker a probe that returns 201. Rejection is
loud, safe, and debuggable. An audit event `BALLOT_REJECTED` is written with the error codes
and **not** the selections.

## 5. Weighting: the core business rule

Naive weighting — multiply a student vote by 0.75 and an employee vote by 0.25 — is wrong,
because the groups are wildly different sizes. With ~118 students and ~20 employees, an
employee's vote would be worth about a fifth of a student's *and* there would be six times
fewer of them, so the employee body would carry ~4% of the outcome instead of 25%.

The correct model normalises **each group's share independently**, then combines:

```
For a position p and candidate c, for each eligible voter type t:

    share(c, t)  =  votes(c, t) / totalVotes(p, t)        (0 if totalVotes(p, t) == 0)
    contrib(c,t) =  share(c, t) × effectiveWeight(p, t)

    finalScore(c) = Σ_t contrib(c, t)
```

Worked example (President, configured 0.75 / 0.25):

| | votes | group total | share | × weight | contribution |
| --- | --- | --- | --- | --- | --- |
| students | 60 | 118 | 0.50847 | × 0.75 | 0.38136 |
| employees | 10 | 20 | 0.50000 | × 0.25 | 0.12500 |
| | | | | **final** | **0.50636** → 50.64% |

Group sizes never appear in code. `totalVotes(p, t)` is counted from the ballots actually
cast in that position by that voter type — so the arithmetic is identical for 118 students
or 1,180.

## 6. Effective weights (the part the addendum is about)

House Captain contests have **no eligible employees**. Applying 75/25 to them would give
every candidate an employee share of 0/0 and cap a candidate holding 100% of the student
vote at 0.75. That is simply a wrong number.

So weights are resolved **per position, from that position's eligibility**:

```ts
function effectiveWeights(config, position, tallies): {
  weights: Partial<Record<VoterType, number>>;
  basis: WeightingBasis;
}
```

Resolution order:

1. Take the position's `eligibility.voterTypes`.
2. Look up each type's configured weight.
3. **Renormalise so the eligible weights sum to 1.**
   - Only students eligible → `{ student: 1.0 }`, basis `SINGLE_GROUP`.
   - Both eligible → `{ student: 0.75, employee: 0.25 }`, basis `WEIGHTED`.
   - (The renormalisation step is what makes this generic: adding an `alumni` type with a
     weight tomorrow requires no change here.)
4. Apply the zero-turnout policy (§6.1).

`validateConfig` rejects a configuration whose *global* weights do not sum to 1 (within
1e-9), and rejects any weight outside [0, 1] or any position with an empty `voterTypes`.

Every result row reports the basis that was applied, in words:

| Basis | Label in results output |
| --- | --- |
| `WEIGHTED` | `Weighted 75/25 (student/employee)` |
| `SINGLE_GROUP` | `Student-only (100%)` |
| `RENORMALISED_ZERO_TURNOUT` | `Student-only (100%) — employee eligible but cast no votes` |
| `ZERO_TURNOUT_RETAINED` | `Weighted 75/25 (student/employee) — employee cast no votes; weight retained, so the maximum attainable score is 75%` |
| `NO_VOTES` | `No votes cast` |

`RENORMALISED_ZERO_TURNOUT` and `ZERO_TURNOUT_RETAINED` are the two halves of §6.1 case 2:
which one you get is decided by `zeroTurnoutPolicy`. They are separate bases rather than one
basis with a footnote, so a reader of the results table can never mistake a renormalised
score for a plain weighted one.

### 6.1 Ineligible ≠ eligible-but-silent — and a decision you need to confirm

These two cases look identical in the raw tallies (`totalVotes == 0`) and are handled
differently on purpose:

**Case 1 — the group is INELIGIBLE.** Structural, known before any vote is cast.
Renormalise to the eligible groups. Basis `SINGLE_GROUP`. Not configurable; anything else
is arithmetically wrong.

**Case 2 — the group is ELIGIBLE but cast zero votes.** A turnout fact, not a structural
one. Controlled by `election.zeroTurnoutPolicy`:

| Policy | Behaviour | Effect |
| --- | --- | --- |
| **`renormalise`** *(default)* | drop the silent group, renormalise across groups that voted | scores stay on a 0–100% scale; a candidate with every student vote scores 100% |
| `treat-as-zero` | keep the configured weight; the silent group contributes 0 to everyone | scores compress; the maximum attainable score becomes 0.75 |

> **DECISION — REQUIRES CONFIRMATION BY THE RETURNING OFFICER.**
> The default is `renormalise`. Rationale: (a) within a position, both policies multiply
> every candidate's score by the same constant, so **the ranking and therefore the winner
> are identical either way** — this is a presentation choice, not an outcome choice;
> (b) `renormalise` keeps the published number interpretable ("54% of the electorate that
> voted") instead of an unexplainable ceiling of 75%; (c) the applied basis is printed on
> every row, so the zero-turnout case is never silently invisible.
> If Mesa's governance requires that an absent group's abstention *does* depress scores,
> set `"zeroTurnoutPolicy": "treat-as-zero"` — one field, no code change. Both paths are
> tested.

**Case 3 — no eligible group cast any vote.** Every candidate scores 0, basis `NO_VOTES`,
no winner declared. No division is attempted. This is the "do not silently divide by zero"
requirement: `totalVotes == 0` short-circuits to a share of 0 before any division.

## 7. Results output

Per position, per candidate:

```ts
{
  positionId, positionTitle, weightingBasis, weightingLabel,
  candidates: [{
    candidateId, candidateName,
    perType: { student: { votes, totalVotes, share, weight, contribution },
               employee: { … } | undefined },     // absent when the type is ineligible
    finalScore,          // 0..1
    finalScorePercent,   // rounded to 2dp for display only
    rank,                // competition ranking: 1, 1, 3
    tied                 // true when sharing a rank
  }],
  winner: Candidate | null,   // null when tied at rank 1, or NO_VOTES
  turnout: { eligibleVoters, ballotsCast, turnoutRate, byType: {…} }
}
```

Notes:

- `finalScore` is computed in IEEE-754 doubles. Ties are detected with a tolerance of
  **1e-9**, not `===`, so two candidates who should tie exactly are not separated by float
  noise. Ranking is competition-style (1, 1, 3).
- A tie at rank 1 yields `winner: null` and `tied: true`. The system reports the tie; it
  does not break it. Tie-breaking is a governance act for humans.
- Turnout for a house-captain position is measured against **the students of that house**,
  not the whole roll — it falls out of `isEligible` over the voter roll.
- A candidate present in the configuration but with zero votes appears with
  `votes: 0, share: 0`. A candidate id appearing in tallies but absent from configuration is
  a data-integrity error: `calculateResults` throws `UnknownCandidateError` rather than
  guessing. Results are not a place for best-effort.

## 8. Test matrix

Implemented in `packages/election-core/src/__tests__/`.

**Weighting** — mixed student+employee · student-only position scores a 100%-student
candidate at exactly 1.0 (not 0.75) · zero employee votes under both policies · zero student
votes · all votes to one candidate · exact ties · three-way ties · unknown candidate throws ·
weights not summing to 1 rejected at config load · negative/NaN weights rejected · empty
`voterTypes` rejected · a third voter type renormalises correctly.

**Eligibility & steps** — employee sequence excludes House Captains · employee progress total
is 6 · student sequence includes exactly their own house · student in a house with no
captain position degrades to 6 · ordering is stable.

**Validation** — complete valid ballot · missing one position · missing a house · employee
sending a house selection is rejected (not trimmed) · student sending another house's
captain is rejected · inactive candidate · candidate/position mismatch · unknown ids ·
empty ballot · duplicate candidate across positions.

**Server-side** (in `apps/server`) — forged `voterType` in the payload is ignored and the
ballot rejected · forged `voterId` is ignored · already-voted voter · concurrent duplicate
submissions produce exactly one ballot · same idempotency key replays · different key from
the same voter is rejected as a duplicate vote.
