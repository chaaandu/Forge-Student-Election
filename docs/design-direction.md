# Design direction — "Mesa Departures"

> The election is a departure board. Voting is a trip: you check in, pass through gates, get
> a boarding pass, and depart. The split-flap is the signature; everything else stays quiet
> so the split-flap can be loud.

The concept must be unmistakable and the interface must stay clean and fast. When those two
conflict, speed and clarity win — a voter waiting on an animation is a design failure.

## 1. The metaphor, mapped

| Journey stage | Screen | Board state |
| --- | --- | --- |
| Departure hall | Welcome | `NOW BOARDING` |
| Check-in desk | Voter identification | `CHECK-IN OPEN` |
| Boarding pass issued | Identity confirmation | `PASSENGER CONFIRMED` |
| Gates | One per eligible position | `GATE nn · OPEN` |
| Boarding pass | Review | `READY TO DEPART` |
| Final call | Confirmation modal | `FINAL CALL` |
| Departure | Submitting | `DEPARTING` |
| Wheels up | Thank-you | `DEPARTED` |

Used sparingly: the board is the frame, not the content. Candidate photos, names and
taglines are rendered in clean sans-serif on flat cards. **Candidate names are never
rendered as flaps** — legibility of a person's name outranks the concept.

## 2. Design tokens

Single source of truth: `apps/web/src/styles/tokens.css`, exposed to Tailwind v4 via
`@theme`. Every value below is a CSS custom property; nothing is a magic number in a
component.

### 2.1 Colour

```css
/* board surfaces — flat, no gradients */
--color-ink:        #0A0E14;   /* page background */
--color-board:      #121821;   /* board panel */
--color-flap:       #1C2430;   /* individual flap tile */
--color-flap-edge:  #2A3442;   /* hairline between flap halves */
--color-surface:    #161D28;   /* cards */
--color-surface-hi: #1E2735;   /* card hover */

/* text */
--color-text:       #E9E5DD;   /* bone — body                    15.1:1 on ink */
--color-text-muted: #9AA7B6;   /* secondary                       7.4:1 on ink */
--color-text-dim:   #6B7787;   /* tertiary, large only            3.9:1 — never body */

/* signal */
--color-signal:     #FFB020;   /* amber: board text, CTA         10.2:1 on ink */
--color-signal-ink: #1A1200;   /* text ON amber                  11.8:1 on signal */
--color-go:         #3BD671;   /* confirmed / boarding            9.7:1 on ink */
--color-hold:       #FFB020;   /* in progress = amber */
--color-stop:       #FF6B5E;   /* errors only                     5.6:1 on ink */

/* brand — the one swap point for real Mesa assets */
--color-brand:      #C97B4E;   /* terracotta; large text & accents only, 4.9:1 */
--color-brand-soft: #E8A97D;   /*                                        8.1:1 */
```

Contrast is measured, not assumed — `apps/web/src/styles/__tests__/contrast.test.ts` fails
the build if any foreground/background pair in the token set drops below its required ratio
(4.5:1 body, 3:1 large text and UI boundaries). Amber on ink is 10.2:1, comfortably AA.

**Status colours are never the only signal.** Confirmed state = green + a check glyph + the
word "Selected". Error = red + an icon + plain-language text.

If Mesa brand assets land in the repo, replace `--color-brand*` and the logo slot in
`apps/web/src/components/ui/Wordmark.tsx`. Nothing else should need to change.

### 2.2 Typography

| Role | Family | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- |
| Board / flaps | JetBrains Mono Variable | 700 | +0.04em | tabular, uppercase only |
| Gate & status labels | JetBrains Mono Variable | 600 | +0.12em | uppercase, small |
| Headings | Inter Variable | 650 | −0.02em | sentence case |
| Body / candidate names | Inter Variable | 450–550 | 0 | never uppercase |

Both fonts are **self-hosted** via `@fontsource-variable/*`. No CDN request at runtime — a
school hall with flaky wifi must not get a fallback-font flash mid-election.

Scale (rem): `0.75 · 0.875 · 1 · 1.125 · 1.3125 · 1.75 · 2.375 · 3.25 · 4.5`.

### 2.3 Space, radius, elevation

```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px; --space-9: 96px;

--radius-flap: 3px;   --radius-control: 8px;  --radius-card: 14px;  --radius-pill: 999px;

--shadow-card:  0 1px 2px rgb(0 0 0 / .4), 0 8px 24px rgb(0 0 0 / .28);
--shadow-modal: 0 24px 64px rgb(0 0 0 / .55);
--focus-ring:   0 0 0 2px var(--color-ink), 0 0 0 4px var(--color-signal);
```

Flat, crisp surfaces. **No glassmorphism, no background gradients, no fake 3D** beyond the
flap mechanism itself (where the rotation *is* the point). Exactly two elevations.

### 2.4 Motion

```css
--dur-flap:     110ms;  /* one character flip */
--dur-stagger:   35ms;  /* delay per character */
--dur-select:   160ms;  /* stamp landing */
--dur-step:     260ms;  /* gate to gate */
--dur-enter:    220ms;  /* card / row entrance */
--ease-mech:    cubic-bezier(.23, 1, .32, 1);   /* flaps: fast out, hard stop */
--ease-glide:   cubic-bezier(.22, 1, .36, 1);   /* everything else */
```

Budget: no single board update may take longer than **900 ms** end to end, and no transition
gates a click. If a flip is still running when the voter presses Continue, the navigation
happens immediately and the flip is cancelled.

## 3. The SplitFlap component

`apps/web/src/components/board/SplitFlap.tsx` — built once, reused everywhere, tested.

**Provenance.** React Bits ships a `SplitFlapText` component whose flip mechanic (per-tile
front/back halves, rAF-driven character sequence, staggered start) is exactly right and is
the basis for ours. We re-implemented it in TypeScript rather than copying it in, because
the original is a self-driving marquee with no accessibility layer, and this theme requires
the opposite: a **controlled** component driven by real application state, with the true
text exposed to assistive tech. Attribution: `THIRD_PARTY_NOTICES.md` (MIT + Commons Clause,
© David Haz). See ADR-7.

### 3.1 API

```ts
interface SplitFlapProps {
  text: string;                  // controlled — the component flips TO this
  width?: number;                // pad/truncate to a fixed tile count (stable layout)
  charset?: 'alphanumeric' | 'alpha' | 'numeric' | string;
  flipsPerChar?: number;         // default 6
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'signal' | 'go' | 'stop' | 'neutral';
  label?: string;                // overrides the SR text when `text` is an abbreviation
  onSettled?: () => void;
  timing?: Partial<FlapTiming>;  // injectable for deterministic tests
}
```

### 3.2 Accessibility contract (non-negotiable)

```html
<span class="flap">
  <span class="sr-only">GATE 03 · ACADEMIC LEAD — BOY</span>  <!-- real text, immediately -->
  <span aria-hidden="true" class="flap__tiles">…tiles…</span> <!-- decoration only -->
</span>
```

- The final text is in the DOM on first paint. A screen reader never encounters the
  intermediate random characters, because the animated layer is `aria-hidden`.
- Board regions that change meaningfully (status transitions) carry `aria-live="polite"` on
  the hidden layer; decorative ambient flips do not.
- `prefers-reduced-motion: reduce` → the tiles render the final character immediately with a
  120 ms opacity fade. No rotation, no character cycling. **The experience stays complete:**
  the board still says the same things, in the same places.
- Animation is cancelled and cleaned up on unmount; `rAF` handles are cleared.
- Never used for: candidate names, error message bodies, or anything a voter must read
  under stress. Used for: status lines, gate headers, board rows, the thank-you messages.

### 3.3 Mechanics

Each tile has a top half and a bottom half plus a rotating flap. On change, the tile runs a
short random character sequence ending on the target, `flipsPerChar` steps at `--dur-flap`
each, started at `index × --dur-stagger`. Characters that are unchanged between old and new
text do not flip — a single-word change ripples, it does not reset the board.

## 4. Screen-by-screen motion plan

| Screen | On enter | Interaction | On leave |
| --- | --- | --- | --- |
| **Welcome** | Board rows flip in top-down, 70 ms apart. Title, then status, then position rows. Total ≤ 900 ms. | Status light pulses at 2 s (opacity 1 → .35, no layout). One random row re-flips every ~12 s. CTA lifts 1 px and the amber warms on hover. | CTA press: board dims 120 ms, rows flip to `CHECK-IN OPEN`. |
| **Check-in** | Search field and desk frame fade+rise 12 px. | Results list staggers 30 ms per row. No flips (a name list must be instantly readable). | — |
| **Identity confirm** | Boarding pass slides up 16 px with a 2° settle. Initials avatar scales 0.92 → 1. | — | Pass slides left on Continue. |
| **Gate** | Gate header flips (only the characters that changed). Cards fade+rise 10 px, 40 ms stagger, capped at 6 so a big grid never crawls. | Hover: card lifts 2 px, border warms. Select: stamp scales 1.4 → 1 with a 6° rotation over 160 ms, border → amber, `✓ Selected` fades in. Deselect is instant. | Horizontal slide, direction matches Back/Continue (−24 px / +24 px), 260 ms. |
| **Route line** | Stops draw left to right, 60 ms apart. | Current stop pulses; completed stops fill with a 180 ms fill. | — |
| **Review** | Rows fall in 45 ms apart. Tear line draws left to right over 300 ms. | Edit link underlines on hover. | — |
| **Final call** | Modal scales 0.96 → 1 over 180 ms; backdrop to 70% over 140 ms. Focus trapped on "Go back". | — | — |
| **Submitting** | Board flips to `DEPARTING`; an amber progress bar sweeps **indeterminately** (it must not imply known progress). | Button disabled, spinner inline. | Only on a server 2xx. |
| **Departed** | `VOTE CAST · STATUS: DEPARTED` flips in. Then 3 participation lines flip in, 700 ms apart. A single amber sweep crosses the board once. | "Finish now" available immediately. | At 4 s the board flips back to `NOW BOARDING` and all client state is wiped. |
| **Errors** | Row flips to the error word in red; plain-language text fades in below, unanimated. | Retry button always present where retry is possible. | — |

Under `prefers-reduced-motion`, every row above degrades to opacity-only transitions at
120 ms, and the thank-you screen holds for the same 4 s. Nothing is removed.

## 5. Component inventory

**Board** — `SplitFlap` · `BoardRow` · `BoardPanel` · `StatusLight` · `DepartureBoard`
**Election** — `CandidateCard` · `CandidateGrid` · `RouteLine` (progress) · `GateStep` ·
`HouseGate` · `BoardingPass` (review) · `VoterSearch` · `IdentityPass` · `FinalCallDialog` ·
`DepartedBoard`
**UI** — `Button` (primary/secondary/ghost/danger) · `TextField` · `CodeInput` · `Avatar` ·
`Tag` · `Dialog` · `Toast` · `Spinner` · `Skeleton` · `ErrorState` · `EmptyState` ·
`VisuallyHidden` · `Wordmark`

Every interactive component ships focus-visible styling from `--focus-ring`, a disabled
state that explains itself, and a minimum 44×44 px hit area.

## 6. Candidate card composition

```
┌───────────────────────────┐   Photo: 4:5, object-fit: cover, object-position: center 25%
│                           │          (heads sit high in portraits), lazy below the fold,
│          photo            │          width/height set to reserve space — no layout shift.
│                           │   Fallback: initials on a deterministic house/brand tint.
├───────────────────────────┤
│ Priya Raghavan       [✓]  │   Name: Inter 550, 1.125rem, never truncated mid-word.
│ Consistency over noise    │   Tagline: muted, 2 lines max, ellipsis.
│ ✓ Selected                │   Only when selected. Text, not just colour.
└───────────────────────────┘
```

Selected state carries **three** simultaneous signals: 2 px amber border, the stamp glyph,
and the literal word "Selected". `role="radio"`, `aria-checked`, roving tabindex within a
`radiogroup` labelled by the gate heading.

## 7. Guardrails

- Must not resemble any real airline's branding: no airline-style livery, no imitation of an
  existing carrier's typography or mark. Generic infrastructure signage only.
- Must not feel like a game: no score, no confetti cannon, no sound, no leaderboards. The
  celebration is a board flip and three lines of copy.
- No decorative element may delay input.
- No gradient backgrounds, no blur/frosted panels, no drop-shadow glows except focus.
- Theme copy always pairs with plain copy. `GATE CLOSED` alone is never the whole message.
