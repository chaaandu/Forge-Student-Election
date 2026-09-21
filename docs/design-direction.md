# Design direction — "Vote / Form"

> Primaries, elementary forms, heavy black rules, and a rigorous asymmetric grid.
>
> The Bauhaus was after a universal visual language for things everyone uses. An
> election is exactly that kind of thing. So each position is a poster, and the
> ballot is a portfolio of them.

## 0. What this replaced, and why

Two directions came before this one, and both are worth recording because the
reasons still constrain the work.

**"Mesa Departures" — a split-flap departure board.** Rejected as cold and
industrial. An airport board is a machine telling you what is happening *to*
you; a ballot is a thing you act *on*. It also fought its own content —
photographs and human names sat badly on a surface built for amber monospace
abbreviations — and every error arrived in costume (`GATE CLOSED`) that had to
be decoded before it could be understood.

**"The Ballot" — warm paper and terracotta ink.** Correct in substance and too
quiet in execution. It solved the plain-language problem but read as restrained
and beige where this wants energy.

**"Vote / Form" keeps what worked and adds the missing voltage.** Plain language
stays — the errors are still sentences, not slogans. The paper substrate stays.
What changes is that colour is now doing real work: saturated primaries as
fields, elementary forms as identity, and black bars as structure.

## 1. The grammar

Four rules, taken from the source rather than from a mood board.

1. **A colour is a field, not ink.** Saturated colour fills a block; type on it
   is black or white by luminance. §2.1.
2. **Form carries meaning alongside colour.** Kandinsky's correspondence —
   red square, blue circle, yellow triangle — plus the arc, the fourth form
   Bauhaus composition leans on. Houses get a form *as well as* a colour, which
   is both historically literate and the reason house identity survives colour
   blindness. §3.
3. **Bars are structure.** A heavy black rule divides; it does not decorate.
   Corners are not rounded. A circle is a circle.
4. **Depth is an offset, not a blur.** Panels sit on a hard black block, the way
   a second impression sits under the first. There is no soft shadow and no
   backdrop blur anywhere in the interface.

## 2. Tokens

`apps/web/src/styles/tokens.css`. Every value is a custom property; nothing is a
magic number in a component.

### 2.1 Colour — and the rule that makes it work

```css
/* fields — for blocks, bars and forms. NEVER body text on paper. */
--bh-red:    #DE2B1F;   --bh-blue:   #1B4D9B;
--bh-yellow: #FFC20E;   --bh-green:  #1E7A4C;

/* their text-safe counterparts, darkened until AA on paper. Hue preserved. */
--bh-red-text:    #CE281D;  /* 4.56:1 */
--bh-blue-text:   #1B4D9B;  /* 6.96:1 — already passes */
--bh-yellow-text: #876707;  /* 4.52:1 — yellow can only be text this dark */
--bh-green-text:  #1E7A4C;  /* 4.56:1 */

--color-paper: #F2EDE1;   --color-card: #FFFFFF;   --color-sunk: #E8E2D4;
--color-ink:   #141414;   /* 15.8:1 */
--color-ink-soft: #514D48;/*  7.2:1 */
--color-ink-faint:#7D766C;/*  3.8:1 — large only, never body */

--color-rule: #141414;  --rule-weight: 3px;  --rule-weight-heavy: 6px;
--shadow-block: 6px 6px 0 var(--color-ink);
```

**Bauhaus yellow is 1.39:1 against paper.** As ink it is invisible; as a field
with black type on it, 11.4:1. Same colour, opposite outcome — which is why the
field/ink distinction is a rule rather than a preference.

`apps/web/src/lib/color.ts` implements it in three pure, unit-tested functions:

| Function | Does |
| --- | --- |
| `inkOn(field)` | black or white, whichever is more readable on that field |
| `readableOn(colour, bg, ratio)` | darkens until it passes, preserving hue |
| `roleFor(colour)` | one configured colour → `{ field, onField, text, wash }` |

This is what lets a house be configured with **one** hex value and still be
correct in four different uses. `contrast.test.ts` then asserts the stylesheet
and the live election configuration both hold up — and it has already caught
three failures before they shipped: an earlier mark at 4.48:1, a Gladiators
bronze at 3.7:1, and a drift between a CSS text variant and what `readableOn()`
derives.

### 2.2 Typography

| Role | Family | Why |
| --- | --- | --- |
| Poster headlines | **Staatliches** | Google's digitisation of **Herbert Bayer's title lettering for the 1923 Bauhaus exhibition catalogue**. The actual historical voice, not a pastiche. OFL-1.1. |
| Labels, numerals, controls | **Jost\*** | An open Futura — the Bauhaus-descended geometric sans. OFL-1.1. |
| Candidate names, body | **Inter** | Geometric faces have a low x-height, and 145 unfamiliar names read at a booth is the wrong place to pay for that. |

Self-hosted, latin subsets only (~176 KB). No CDN at runtime: a hall with flaky
wifi must not get a fallback-font flash mid-election.

Numerals are set large and unapologetically — the Bauhaus did, and a position
number at 4 rem gives the sequence a sense of progress that a breadcrumb cannot.

### 2.3 Motion

```css
--dur-mark: 380ms;  --dur-snap: 260ms;  --dur-step: 320ms;
--ease-snap: cubic-bezier(.34, 1.56, .64, 1);  /* overshoot: a block dropping */
--ease-out:  cubic-bezier(.22, 1, .36, 1);
```

The overshoot curve is the whole feel: shapes and cards **snap** into place
rather than easing, like a printer's block landing. No transition gates a click.

## 3. House identity: colour **and** form

| House | Field | Form | Kandinsky |
| --- | --- | --- | --- |
| Samurai | red `#DE2B1F` | square | red ↔ square |
| Knights | blue `#1B4D9B` | circle | blue ↔ circle |
| Gladiators | yellow `#FFC20E` | triangle | yellow ↔ triangle |
| Vikings | green `#1E7A4C` | arc | the fourth form |

`shape` is part of the election configuration, not hard-coded, and the contrast
test asserts all four are distinct. A voter who cannot distinguish red from
green still sees a square against an arc — and the house name is written beside
it wherever it matters.

A house contest takes that house's field across the whole plate header, so a
student arrives at a screen that is unmistakably theirs.

## 4. The signature interactions

**`InkMark`** — a hand-drawn check that draws itself in one stroke. The path
deliberately overshoots and its legs differ in length, with an SVG turbulence
filter roughing the edge: a geometrically perfect mark reads as a logo, this
reads as a hand. Used for choosing, for progress, for each review row, and for
the confirmation.

**The card snap** — choosing a candidate drives a solid colour field across the
foot of the card, drops the ink mark into the box, and moves the whole card up
into a deeper offset block. Four simultaneous signals: mark, field, offset, and
the literal word "Selected". Never colour alone.

**`BallotProgress`** — one elementary form per position *this voter* is eligible
for. Answering fills it with colour, so the row assembles into a small
composition as the ballot is completed. Forms and colours cycle on different
periods so no two neighbours look alike. An employee sees six tokens, never six
of ten.

**`Burst`** — the celebration. Elementary forms in primaries thrown outward and
settling, deliberately *not* confetti: confetti reads as a prize, and nothing
here should suggest the voter won something or chose well.

## 5. `Composition3D` — the welcome piece

Cube, disc, prism and half-cylinder in the primaries, under an **orthographic**
camera. That is the point: an axonometric projection with no perspective
convergence is how the Bauhaus and the Constructivists drew objects, and it
keeps the image reading as a poster rather than as a render.

Shading is quantised to three hard bands from screen-space derivatives, so every
facet is flat, and each solid wears an inverted-hull black outline that carries
the 2D keylines into three dimensions. No smooth shading, no specular, no
shadow.

**Five rules it obeys, all verified:**

1. **Decoration, never dependency.** `CompositionSVG` is the real artwork —
   complete, readable, instant. The 3D layer fades in over it and is
   `aria-hidden`.
2. **Never in the app bundle.** `import('three')` is dynamic; the production
   check confirms `index.html` references the three chunk **zero** times. App
   bundle 280 KB, three 747 KB, lazily.
3. **Never loaded when it should not be.** Skipped under `prefers-reduced-motion`
   and after a WebGL capability probe fails.
4. **Never a burden.** DPR capped at 2, rendering paused on tab hide, every
   geometry, material and renderer disposed on unmount.
5. **The CTA works first.** "Begin voting" is interactive from first paint.

## 6. Gamification — and its one hard limit

The user asked for this to be more fun. It is, and there is a line through it:

> **Gamify participation. Never gamify the choice.**

No candidate has a score, a rank, a badge or a leaderboard anywhere a voter can
see. Nothing rewards picking one person over another, and nothing implies a
"good" vote. What *is* playful:

- progress as a composition you assemble;
- the snap and the drawn mark — the small satisfactions of marking a paper;
- position numbers set poster-large, which gives the sequence momentum;
- a house's colour and form taking over its own plate;
- the burst on completion, for having voted at all;
- **the house turnout race on `/monitor`** — live lanes, house colours and
  forms, leader highlighted. This is the real win: it drives turnout in the room
  without touching the ballot. It shows *who voted*, never *what for*, and a
  test asserts that payload contains no candidate id.

## 7. Open source: what was evaluated and what was taken

| Project | Licence | Verdict |
| --- | --- | --- |
| **Staatliches** (googlefonts) | OFL-1.1 | **Adopted.** Bayer's 1923 exhibition lettering. Nothing else is this authentic. |
| **Jost\*** (indestructible type) | OFL-1.1 | **Adopted.** An open Futura for the geometric voice. |
| **three.js** | MIT | **Adopted**, lazily and decoratively only. |
| `bauhaus-avatar-generator` | MIT | Evaluated. Good idea, but portraits are generated once at build time and are placeholders until real photos land — a runtime dependency buys nothing. The deterministic-shapes idea is used in the build script instead. |
| `bauhaus-ui-library` | MIT | **Rejected.** A young library; adopting a whole component system would mean re-doing our tested, accessible components against an unknown one days before an election. Wrong trade. |
| React Bits | MIT + Commons Clause | Used by the first direction, removed with it. No code remains. |

## 8. Guardrails

- No gradient that reads as a gradient, no glow, no glassmorphism, no blur.
- No rounded corners beyond the 2 px needed to stop a control looking broken.
- Colour is never the only carrier of meaning — not for selection, not for
  house identity, not for errors.
- Themed language never replaces plain language. Error headlines are sentences.
- Decoration never delays input and never gates a click.
- No sound. A shared room with a queue in it.
