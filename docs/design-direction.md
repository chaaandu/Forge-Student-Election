# Design direction — "The Ballot"

> Paper, ink, and the weight of a mark.
>
> A vote is a considered, physical act, so the interface is made of paper rather
> than of screens: warm laid stock, printed rules, and a mark you make in ink.
> Everything is light, quiet and tactile. Nothing glows.

## 0. What this replaced, and why

The first direction was a split-flap departure board — dark, mechanical,
industrial signage. It was rejected, correctly. An airport board is a machine
telling you what is happening to you; a ballot is a thing you act on. The board
also fought its own content: candidate photographs and human names sat badly on
a surface built for abbreviations in amber monospace, and the "gates and
departures" language wrapped every error message in a costume that had to be
decoded before it could be understood.

The paper direction fixes that at the root. Its plain voice **is** the theme:
"You have already voted" needs no translation, and a ballot paper is the one
metaphor for an election that is not a metaphor at all.

## 1. The concept, mapped

| Journey stage | What it is |
| --- | --- |
| Welcome | The ballot, waiting on the desk |
| Check-in | Signing in at the table |
| Identity confirmation | Your name at the top of the ballot |
| Each position | One position, one sheet |
| Review | The completed ballot |
| Confirmation | A slip laid over it |
| Submitting | Recording the vote |
| Done | The ballot is in the box |

Used with restraint. The paper is the frame; the candidates are the content.

## 2. Design tokens

Single source of truth: `apps/web/src/styles/tokens.css`, exposed to Tailwind v4
via `@theme`. Every value below is a custom property; nothing is a magic number
in a component.

### 2.1 Colour

```css
/* paper — warm laid stock, never pure white */
--color-paper:      #F4F0E6;  /* the desk */
--color-sheet:      #FCFAF4;  /* a sheet resting on it */
--color-sheet-sunk: #EEE9DB;  /* input wells, recessed areas */
--color-edge:       #E4DDCC;  /* the shadowed edge of a sheet */
--color-rule:       #D9D1BE;  /* hairline rules, as on a printed form */
--color-rule-strong:#BDB39C;

/* ink */
--color-ink:        #1B1A16;  /* body                 15.4:1 on paper */
--color-ink-soft:   #56524A;  /* secondary             6.6:1 */
--color-ink-faint:  #837C6D;  /* tertiary, large only  3.4:1 — never body */

/* the mark */
--color-mark:       #A9462C;  /* terracotta            5.1:1 */
--color-mark-wash:  #F3E0D8;  /* the faint stain behind a chosen card */
--color-confirm:    #47664E;  /* recorded              6.3:1 */
--color-alert:      #9B3322;  /* errors only           7.3:1 */
```

Terracotta is the ink you mark with — and the colour of a mesa at dusk, which
is as much brand as this needs until real assets arrive.

**Contrast is measured, not assumed.** `src/styles/__tests__/contrast.test.ts`
reads the real stylesheet and fails the build if any pair drops below its
required ratio. It has already caught two shipped-looking mistakes: the mark at
4.48:1 on sunk paper (one notch under AA) and a Gladiators bronze at 3.7:1. A
light palette makes this easy to get wrong in the opposite direction from a dark
one — warm greys that look elegant on a calibrated display and vanish under a
hall's overhead lights.

House colours come from `election.config.json` and are asserted by the same
test, so a colour chosen by whoever runs the election cannot quietly fail AA.

### 2.2 Typography

| Role | Family | Notes |
| --- | --- | --- |
| Display, headings, the ballot masthead | **Fraunces Variable** | A warm, slightly wonky serif. Printed matter, not a product UI. |
| Body, candidate names, all controls | **Inter Variable** | Chosen for legibility at arm's length; never set in the serif. |
| Reference codes | system mono | One or two places. |

Both self-hosted, latin subsets only (~170 KB total). No CDN at runtime: a hall
with flaky wifi must not get a fallback-font flash mid-election.

Base size is `1.0625rem` rather than the usual `1rem` — this is read standing
up, at a booth, often by someone in a hurry.

### 2.3 Space, radius, elevation

```css
--radius-sm: 3px;  --radius-control: 6px;  --radius-sheet: 10px;
--shadow-sheet: 0 1px 1px rgb(58 48 30 / .05), 0 6px 18px -6px rgb(58 48 30 / .16);
--shadow-lift:  0 2px 4px rgb(58 48 30 / .07), 0 16px 34px -12px rgb(58 48 30 / .24);
--focus-ring:   0 0 0 2px var(--color-sheet), 0 0 0 4px var(--color-mark);
```

Paper has corners, not pills, so radii stay small. Shadows are warm and close —
the shadow a real sheet casts on a desk, not a drop-shadow effect. Exactly two
elevations.

Fibre texture is one inline SVG turbulence filter at low opacity with
`mix-blend-mode: multiply`, so it darkens like pulp rather than hazing like
video noise. No image request.

### 2.4 Motion

```css
--dur-mark:   420ms;  /* the ink stroke drawing itself */
--dur-select: 180ms;
--dur-step:   300ms;
--ease-ink:   cubic-bezier(.32,.72,.28,1);  /* a pen: quick start, settled finish */
--ease-paper: cubic-bezier(.22,1,.36,1);
```

No transition gates a click. Nothing loops except the indeterminate submit bar.

## 3. The signature: `InkMark`

`apps/web/src/components/ink/InkMark.tsx`

A hand-drawn check that draws itself in a single stroke, as if someone had just
put a pen to the paper. It replaces the usual tick glyph because a tick is a UI
convention and this is meant to feel like an act.

The path is **deliberately imperfect** — the stroke overshoots and the legs
differ in length — and an SVG turbulence displacement gives the edge a faint
wobble. A geometrically perfect mark reads as a logo; this reads as handwriting.

Used for: choosing a candidate, the progress boxes, each row of the completed
ballot, and the confirmation on the done screen. Nowhere else.

**Accessibility.** Decorative by default (`aria-hidden`); selection is carried
by the card's `aria-checked`, its border and wash, and the literal word
"Selected", so the mark is never the only signal and never a colour-only one.
Under `prefers-reduced-motion` it renders fully drawn with no animation. Each
instance gets a unique filter id so two marks on screen cannot collide.

## 4. The welcome sheet (WebGL)

`apps/web/src/components/paper/BallotSheet3D.tsx`

A real sheet of ballot paper in three dimensions: resting undulation, corners
that lift more than the middle, and a lift that follows the pointer as a hand
would. Warm directional light, wrap lighting (paper is thin enough to transmit),
a dry broad sheen for uncoated stock, and fibre grain at close range.

The election name is **printed onto the sheet** via a canvas texture rather than
floated above it, so the type creases and catches the light with the paper. That
is the whole trick — it reads as printed matter instead of a caption over a
background.

### Rules it obeys

1. **Decoration, never dependency.** The welcome screen renders a complete,
   readable printed sheet in HTML. The 3D layer fades in on top of it and is
   `aria-hidden`. That HTML sheet is what a screen reader reads, what renders
   without WebGL, and what a reduced-motion voter sees — a full experience, not
   a degraded one.
2. **Never in the main bundle.** `import('three')` is dynamic. Rollup emits it
   as a separate ~747 KB chunk that no voting path downloads; the application
   bundle stays ~275 KB. `chunkSizeWarningLimit` is set above the three chunk
   *and below double the app bundle*, so the warning still fires if the app
   itself grows.
3. **Never loaded when it should not be.** Skipped entirely under
   `prefers-reduced-motion`, and after a WebGL capability probe fails.
4. **Never a burden.** Pixel ratio capped at 2, rendering paused when the tab is
   hidden, geometry/material/texture/renderer all disposed on unmount.
5. **The CTA works first.** "Begin voting" is interactive from first paint,
   before and without any of this.

## 5. Screen-by-screen motion

| Screen | On enter | Interaction |
| --- | --- | --- |
| **Welcome** | Printed sheet paints immediately; 3D cross-fades over 700 ms when ready | Sheet lifts toward the pointer |
| **Check-in** | Sheet fades in | Results list staggers 30 ms per row. No animation on names — a list you search must be instantly readable |
| **Identity** | Sheet rises 12 px | Name set large enough for an invigilator to read across a booth |
| **Position** | Slide 18 px in the direction of travel; cards rise 8 px, 45 ms apart, capped at 6 | Hover lifts 2 px. **Choosing draws the ink mark over 420 ms** |
| **Review** | Rows fall in 45 ms apart; perforation above the final action | Edit per row |
| **Confirmation** | Slip scales in with a 0.25° rotation, focus trapped on "Go back" | — |
| **Submitting** | Indeterminate sweep — never implies known progress | — |
| **Done** | Green mark draws in a box; three lines appear 650 ms apart | Resets after 4 s |

Under `prefers-reduced-motion` every row degrades to an opacity fade at 120 ms,
and the done screen holds for the same 4 s. Nothing is removed.

## 6. Composition of a candidate

```
┌───────────────────────────┐   Photo 4:5, object-position center 25% (heads sit
│          photo            │   high in portraits), lazy, dimensions reserved.
│                           │   Fallback: initials set in the display serif.
├───────────────────────────┤
│  ☑  Preet Jain            │   A ballot line: box on the left, name beside it.
│     Selected              │   The box takes the ink mark.
└───────────────────────────┘
```

Composed like a printed ballot paper rather than a web card. Minimum 44 px
targets, whole card clickable, `role="radio"` inside a `radiogroup`, roving
tabindex, arrow keys to move and Space/Enter to mark.

Selecting never advances the ballot — an accidental tap must not move it on.

## 7. Guardrails

- No glow, no neon, no dark surfaces, no glassmorphism, no gradient that reads
  as a gradient.
- No monospace as a decorative voice.
- Themed language never replaces plain language. With paper, plain language *is*
  the voice — which is why the error headlines are sentences a voter can read
  at a glance.
- Decoration never delays input and never gates a click.
- No sound, no confetti, no score. The celebration is a drawn mark and three
  quiet lines.

## 8. Component inventory

**Paper** — `Sheet` · `BallotSheet3D` · `ballotPrint`
**Ink** — `InkMark`
**Election** — `CandidateCard` · `CandidateGrid` · `BallotProgress`
**UI** — `Button` (primary/secondary/quiet/danger) · `TextField` · `Avatar` ·
`Tag` · `Dialog` · `ErrorState` · `Wordmark`

Every interactive component ships `focus-visible` styling from `--focus-ring`, a
disabled state that explains itself, and a minimum 44 px hit area.
