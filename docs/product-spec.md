# Product specification — Mesa Elections

## 1. Who this is for

| Actor | Context | What they need |
| --- | --- | --- |
| **Student voter** | Queueing at a kiosk in a hall, phone in hand, friends watching. Two to four minutes of attention. | To vote for 6 leadership roles + their own house captain, fast, without wondering whether it worked. |
| **Employee voter** | Between meetings, on a laptop. | To vote for 6 leadership roles. Nothing else. To not be shown things that do not apply to them. |
| **Returning officer** | Runs the election, hands out access codes, answers "it says I already voted". | Turnout visibility, sync health, an audit trail, and a clear answer for every error a voter can hit. |
| **Results verifier** | After the close. | Raw counts, per-group percentages, the weighting actually applied, and confidence that the numbers were not touched. |

The voter is the primary user. Every trade-off between voter clarity and administrative
convenience resolves in favour of the voter.

## 2. Product principles

1. **The voter never wonders.** Where am I, what's next, did it save, can I change it, did I
   already vote — each has a visible answer at all times.
2. **Never fake success.** No success state, animation, or copy appears before the server has
   confirmed. A celebration on a timer is a lie the voter cannot detect.
3. **Show only what applies.** An employee has no House Captains step. It is not hidden or
   disabled — for them it does not exist, including in the progress count.
4. **Theme second, meaning first.** Every themed string carries plain meaning. "ALREADY
   DEPARTED" is always followed by "our records show you've already voted."
5. **Shared machine, private ballot.** The screen resets fully between voters and never
   displays selections after submission.

## 3. The voter journey

The theme is a departure board; the trip metaphor is described in
[design-direction.md](./design-direction.md). Functionally:

```
WELCOME → CHECK_IN → IDENTITY_CONFIRM → [ GATE 1 … GATE n ] → REVIEW
        → FINAL_CALL → SUBMITTING → DEPARTED → (3–5s) → WELCOME
```

`n` is **derived per voter** from the positions they are eligible for. It is 7 for a student
(6 leadership + their house captain) and 6 for an employee under the current configuration —
but nothing in the code knows those numbers.

### 3.1 Welcome — the departure hall
Full-screen board. Rows flip in: `MESA ELECTIONS 2026 · STATUS: NOW BOARDING`, then the
positions as destinations. One unmissable CTA: **Check in to vote**. Ambient motion limited
to a blinking status light and an occasional single-row flip. Idle state is the default
state — this screen is what the next voter walks up to.

If the election is not open, the CTA is replaced by the relevant state (`BOARDING NOT OPEN`
with the opening time, or `GATE CLOSED`). The CTA is never present-but-broken.

### 3.2 Check-in — identification
Behaviour depends on the configured identity provider (see
[security-model.md §3](./security-model.md#3-identity-and-authentication)):

- **Entra**: a single "Check in with your Mesa account" button → Microsoft login → return.
  No name search at all; the identity is discovered, not asserted.
- **Access code**: type-ahead search of the roll (minimum 2 characters, max 8 results,
  emails masked in results), select your name, then enter the 6-character code from your
  slip. Wrong code → remaining-attempts feedback, then a lockout.
- **Dev**: select a name. A permanent red `DEVELOPMENT MODE — VOTES ARE NOT REAL` banner is
  displayed on every screen.

Search that returns nothing says *"No match. Check the spelling, or see the returning
officer if you think you should be on the roll."* — never a bare "no results".

### 3.3 Identity confirmation — the boarding pass
A boarding-pass card: initials avatar, full name, email, and voter type as a class tag
(`STUDENT` / `EMPLOYEE`), plus house for students. Actions: **Not you? Start over** and
**Continue**. This is the last point at which an identity mistake is cheap, so it is a full
screen, not a toast.

### 3.4 Gates — one position per screen
Header reads `GATE 03 · ACADEMIC LEAD — BOY`. Below: a route line with one stop per gate —
completed stops filled, current stop pulsing, future stops hollow. Candidates as a
responsive grid of photo-led cards.

- The whole card is the target (`role="radio"` inside a `radiogroup`), minimum 44×44 CSS px,
  in practice much larger.
- Selection is communicated by **three** simultaneous signals: a stamp/check mark, a border
  and background change, and the visible text `✓ Selected`. Never colour alone.
- Keyboard: arrow keys move within the group (roving tabindex), Space/Enter selects, Tab
  reaches the group then the navigation.
- **Continue** is disabled until a selection exists, and says why:
  *"Select a candidate to continue"*.
- **Back** is always available and always preserves every selection made so far.

Advancing does **not** auto-happen on selection — an accidental tap must never advance the
ballot.

### 3.5 House captains
Rendered by the same gate machinery. A student sees exactly one house-captain gate: their
own house, presented as that house's concourse using the house colour from configuration.
Employees have no such gate.

### 3.6 Review — the boarding pass
Every eligible position as a row: position name, chosen candidate (photo + name), and an
**Edit** link that returns to that exact gate and comes back to Review. A perforated tear
line separates the summary from the action. The required copy appears verbatim:

> Please check your selections carefully. Once you submit your vote, you cannot change it.

Then **Confirm & Submit Vote**. An employee's review has no House Captains section at all —
not an empty one.

### 3.7 Final call
A modal, focus-trapped:

> **Final call.** Once your vote departs, it can't be changed.

Buttons: **Go back** / **Cast my vote**. Two deliberate confirmations (review + final call)
stand between a selection and an irreversible act.

### 3.8 Submitting
Board flips to `STATUS: DEPARTING`. The button is disabled and shows in-flight state.
Duplicate clicks are absorbed client-side *and* de-duplicated server-side by the idempotency
key, which is generated once per ballot — a retry is the same key, never a new one.

### 3.9 Departed — wheels up
Only after a 2xx: board flips to `VOTE CAST · STATUS: DEPARTED`, then participation messages
flip in row by row — *"Wheels up." · "You showed up. You voted." · "Your voice is on its
way." · "That's democracy, Mesa style."* — celebrating participation, never a choice.

**No selections are shown.** After 4 seconds (configurable 3–5s) the board resets to
`NOW BOARDING`, all client state is cleared, and the kiosk is ready for the next voter.
A "Finish now" affordance lets a voter leave immediately.

## 4. Functional requirements

| # | Requirement | Verified by |
| --- | --- | --- |
| F1 | A voter may cast at most one ballot, enforced by the server. | `concurrency.test.ts`, `ballots.test.ts` |
| F2 | The step sequence contains exactly the positions the voter is eligible for. | `steps.test.ts` |
| F3 | Progress totals reflect the voter's own sequence length. | `steps.test.ts` |
| F4 | Navigating back and forward never loses a selection. | `machine.test.ts` |
| F5 | Editing from Review returns to Review. | `machine.test.ts` |
| F6 | A ballot is submittable only when every eligible position is selected. | `validation.test.ts` |
| F7 | A ballot containing an ineligible position is rejected whole, not trimmed. | `validation.test.ts`, `ballots.test.ts` |
| F8 | A forged `voterType`/`voterId` in the payload has no effect. | `security.test.ts` |
| F9 | Repeating a submission with the same idempotency key returns the original result. | `idempotency.test.ts` |
| F10 | Success is shown only on a confirmed server response. | `submission.test.tsx` |
| F11 | House Captain results use student-only (100%) weighting. | `results.test.ts` |
| F12 | Leadership results use the configured 75/25 weighting. | `results.test.ts` |
| F13 | Excel unavailability never loses or falsifies a vote. | `sync.test.ts` |
| F14 | Every sensitive event is written to a tamper-evident audit log. | `audit.test.ts` |

## 5. Non-functional requirements

- **Performance**: interactive within 2 s on a mid-range laptop over LAN; gate-to-gate
  transition under 250 ms; no network request between gates (the whole election config is
  fetched once at check-in).
- **Accessibility**: WCAG 2.2 AA. Keyboard-complete, screen-reader-complete, AA contrast
  including amber on the dark board, full `prefers-reduced-motion` path.
- **Resilience**: the client survives a network outage between gates without losing
  selections and states clearly that it is retrying.
- **Privacy**: no query in the system can return "voter X chose candidate Y".

## 6. Out of scope for this release

Admin UI (API and service boundaries exist for it) · voter self-registration · candidate
self-service profiles · live public results · email notifications · multi-election tenancy.

## 7. Copy reference

Strings that carry legal or integrity weight are fixed and live in `apps/web/src/copy.ts`:

| Key | Text |
| --- | --- |
| `review.warning` | Please check your selections carefully. Once you submit your vote, you cannot change it. |
| `finalCall.body` | Final call. Once your vote departs, it can't be changed. |
| `error.alreadyVoted` | ALREADY DEPARTED — our records show you've already voted. If you believe this is a mistake, please speak to the returning officer before you leave. |
| `error.notOpen` | BOARDING NOT OPEN — voting opens at {time}. |
| `error.closed` | GATE CLOSED — voting closed at {time}. Your vote can no longer be accepted. |
| `error.network` | DELAYED — your selections are safe on this screen. We're retrying. |
| `error.submitFailed` | Your vote was NOT recorded. Nothing has been saved. Try again, and tell the returning officer if it keeps failing. |
