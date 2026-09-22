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

## 3. House identity: crest, colour **and** form

Each house has a real crest — a black shield carrying a coloured helm. The
colour in the configuration is sampled from that helm, not chosen:

| House | Crest | Field | Form | Kandinsky |
| --- | --- | --- | --- | --- |
| Samurai | blue kabuto | `#2D62AE` | circle | blue ↔ circle |
| Knights | red great helm | `#BE3A2B` | square | red ↔ square |
| Vikings | gold horned helm | `#EDB825` | triangle | yellow ↔ triangle |
| Gladiators | green spartan helm | `#6E9F3F` | arc | the fourth form |

> **This was wrong until the crests arrived.** An earlier configuration had all
> four rotated — Samurai red, Knights blue, Gladiators yellow, Vikings green —
> invented before anyone had seen the artwork. Nothing in the system could have
> caught it: the colours were valid, distinct and passed contrast. Only the
> source material revealed it. `houseIdentity.test.ts` now pins each house to
> the hue family of its crest so it cannot drift back.

Pleasingly, correcting the colours left Kandinsky's correspondence intact — the
forms simply moved with them.

`HouseCrest` renders the real shield and falls back to the drawn shield carrying
the elementary form when the image is missing or fails. So a house is
identifiable three ways over, and never by colour alone: a voter who cannot
separate red from green still sees a square against an arc.

Crests are **PNG** with a transparent background, since they sit on both the
light plates and the dark welcome screen. Drop them into
`assets/house-logos/<id>.png` and run `npm run houses:import`; a partial set is
fine, and anything missing gets a drawn PNG placeholder in the same shape and
proportions, so the layout it occupies is the layout the real crest will occupy.
Colour is declared rather than sampled by code, because a dominant-colour pass
over a black shield returns black.

The crests appear on the ballot sheet itself, the position header of a house
contest, the identity pass, the review rows, and the monitor lanes.

They are deliberately **not** repeated along the foot of the welcome screen.
They are printed on the sheet a metre away from the voter's eye; a second row of
them competed for attention without saying anything new. Houses are named again
at the house contest, which is where a voter needs them.

A house contest takes that house's field across the whole plate header with its
crest beside the position, so a student arrives at a screen that is
unmistakably theirs.

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

**`BallotProgress`** — one box per position *this voter* is eligible for, marked
in ink as it is answered, so the row fills in the way a paper ballot does. An
employee sees six boxes, never six of ten.

An earlier version cycled the four elementary forms here. It was wrong twice
over. Visually, **equal bounding boxes are not equal weight**: at the same box a
circle covers 79% of a square, a triangle 50%, a semicircle 39%, so the arc all
but vanished from the row. More importantly the variety carried no information —
the form told a voter nothing about the step. The forms belong to the houses,
where they mean something; here they were decoration dressed as signal. What
*does* carry information is kept: the house-captain step takes that house's
colour, so a voter sees their own house waiting at the end of the row.

`Shape` now normalises optical weight wherever forms DO appear together: each is
scaled by `√(1 / area)` so a triangle and a square carry the same ink. The
bounding boxes differ instead, which is the correct trade — weight is what the
eye reads.

**`Burst`** — the celebration. Elementary forms in primaries thrown outward and
settling, deliberately *not* confetti: confetti reads as a prize, and nothing
here should suggest the voter won something or chose well.

## 5. The welcome backdrop — ThreeUI `3d-paper`

The welcome screen is deliberately a different world from the ballot. Outside,
it is a dark room with a single translucent sheet turning in it; the moment a
voter checks in, everything becomes the light Bauhaus plates. Stepping out of
the atmosphere and into the form *is* the transition.

The backdrop is ThreeUI's `3d-paper`, integrated from its registered source
rather than reproduced.

### Provenance

| | |
| --- | --- |
| Retrieved from | `https://threeui.com/source-code/3d-paper.json` |
| Vendored verbatim at | `apps/web/vendor/threeui/` (see its README) |
| Hashes | all six registered files match the SHA-256 published in the brief |
| Re-checked by | `src/shaders/__tests__/vendoredSource.test.ts`, every test run |

Nothing was eyeballed from the preview. `scripts/build-paper-variant.mjs`
re-verifies the source hash, then applies an enumerated set of **content-only**
patches to produce `public/paper/mesa-elections.html`. A test asserts the
authored `<script>` block carrying three.js r149 and the paper simulation is
**byte-identical** between the two documents — the strongest available statement
that the engine was not touched.

### What was changed, and why

| Change | Reason |
| --- | --- |
| Certificate content | The authored variant reads "SITE OF THE YEAR / NOCTURNE STUDIO / SEASON XP" — a design award for a fictional studio. It now carries the election, the real houses (with their Bauhaus forms), and the 75/25 weighting. House names and colours are read from `election.config.json`, so the artwork cannot drift from the ballot. |
| Background word removed | The authored variant sets a giant word behind the sheet. The election title already sits on the panel beside it, and two of them compete. |
| Sheet offset right | On wide viewports the sheet sits in the right half, leaving the left to the panel. It stays centred on narrow ones, where there is no room to give. `group.position.x` is written every frame by the animation loop, so the offset is folded into that expression rather than set once. |
| Accents | lime/cyan → the Mesa yellow and a blue lifted for the dark sheet |
| Fonts inlined as data URIs | The authored file fetches Google Fonts at runtime. A hall kiosk must not depend on a third-party request mid-election. Inlining also sidesteps CORS: the frame is sandboxed *without* `allow-same-origin`, so it has an opaque origin and a same-origin font file would be refused too. |
| House crests inlined and drawn onto the sheet | The ballot carries the four shields. Inlined for the same opaque-origin reason as the fonts — the frame cannot fetch `/houses/*.png` either. |
| Hint copy removed | "Drag to turn it · Hover to light it" is a demo affordance. On a voting kiosk the only instruction on screen should be how to vote; the sheet still responds to drag and hover for anyone who tries. |
| Redraw once fonts **and** crests settle | The authored file builds the `CanvasTexture` synchronously, so a late webfont — or a crest still decoding — would be baked out of it permanently. The first draw uses the elementary forms; the redraw swaps in the shields. |

### Two deliberate deviations from the authored integration

1. **Served from `/public` via `src`, not inlined via `srcDoc`.** The authored
   `ThreeDPaper.tsx` statically imports all four variants with `?raw` — roughly
   **2.5 MB into the JavaScript bundle**, against an application bundle of
   275 KB, landing on the one screen that must be interactive immediately.
   Serving the document keeps it out of the bundle and lets the browser cache
   it.
2. **The `three` npm package was removed.** The frame embeds its own three.js
   r149, so a second copy for our own scene was pure weight. The Bauhaus
   `Composition3D` that used it is gone; `CompositionSVG` (dark tone) is the
   instant, reduced-motion and no-WebGL artwork.

Both are recorded here rather than made quietly, and the authored component is
vendored unmodified so the original integration remains available.

### Rules it obeys

1. **Decoration, never dependency.** `aria-hidden`, `tabIndex={-1}`, no meaning.
   "Begin voting" is interactive from first paint.
2. **Never loaded when it should not be.** Skipped entirely under
   `prefers-reduced-motion`; paused when the tab is hidden or the host scrolls
   out of view, exactly as the authored component does.
3. **No access to the election.** The sandbox stays as authored
   (`allow-scripts`, no `allow-same-origin`), so the frame cannot reach the
   parent document, its storage, or the session token.
4. **Zero external requests.** Asserted by test.

### Verified in a browser, including the failure

This section previously read "not verified — this environment has no display and
no headless browser". It has since been driven in headless Chrome, and the
verification found a real fault.

**The frame's `onLoad` fires when the DOCUMENT loads, not when the scene
renders.** On a machine with no usable WebGL the document loaded perfectly
happily, reported itself ready, and the welcome screen faded out its own static
artwork in response — leaving a flat `#08080a` void with the panel sitting in
the corner of it. That is the first thing a voter would have seen on any managed
Windows fleet, remote desktop session or blocklisted integrated driver, which is
to say on a school hall's machines.

`PaperBackdrop` now asks `supportsWebGL()` in the **parent** before mounting the
frame at all. Asking in the parent rather than patching the vendored document
keeps the hash-verified source byte-for-byte what was published. With WebGL
disabled: the iframe is never mounted, `onReady` never fires, and
`CompositionSVG` stays — at full strength rather than the 40% it was drawn at
while waiting behind a sheet that is no longer coming. The fallback is a poster,
not a void.

Confirmed rendering correctly with WebGL available, too: the sheet turns, the
four crests and house colours are drawn onto it, and nothing reaches the network.

Still worth opening on the actual kiosk hardware before election day — headless
Chrome on a Mac is not a school PC — but the screen is no longer unseen.

## 5c. The check-in aurora — React Bits

The check-in desk carries React Bits' `Aurora`: a WebGL shader drawing a slow
band of colour across the page behind the plate.

**It breaks §8's first guardrail and it does so on purpose.** An aurora is a
glowing gradient; the guardrail says no glowing gradients. It was asked for
explicitly, so the rule now carries a named exception rather than the code
quietly disagreeing with the documentation.

What keeps it honest:

- **It is behind the plate, never behind type.** The check-in panel is opaque,
  so the aurora only ever shows in the margins. The rendered-contrast sweep
  runs on this screen with the aurora live and every text node still clears AA
  at its real size.
- **It cannot take a tap.** `pointer-events: none`, verified by hit-testing the
  centre of the name field in a browser and confirming the input is what is
  returned. That field is the first thing a voter touches.
- **It does not exist on the paper ground.** It is a light source designed for
  a dark page; over cream it would be a coloured haze on the screen where a
  voter picks between 145 near-identical names.
- **Three gates, all verified in Chrome rather than assumed:** no WebGL, no
  aurora; `prefers-reduced-motion`, no aurora; tab hidden, the frame loop stops.
  In every case check-in renders and works.
- **It is not in the bundle that gets a voter to the name field.** `ogl` and the
  shader sit behind a `lazy()` boundary: a 50 KB chunk (15 KB gzipped) that
  loads after paint, against a 0.7 KB increase to the main bundle.

Licence: MIT **+ Commons Clause** — not plain MIT. See THIRD_PARTY_NOTICES.md.

## 5b. `Composition3D` — removed

An earlier Bauhaus WebGL piece (elementary solids under an orthographic camera)
was replaced by the paper backdrop above. It is gone, along with the `three`
dependency it needed. `CompositionSVG` remains as the static artwork.

`three` is back in `devDependencies` only, and nothing imports it. The speeches
wall below inlines the r160 bundle into a static document at build time; it
never reaches a browser through the application bundle. See §5d.

## 5d. The speeches wall — ThreeUI `woven-cloth`, washi noren

A separate page from the ballot, at `/wall`. It is projected in the hall
while candidates speak, and it says three things: whose election it is, and what
is happening. Nothing on it is interactive, because nobody is standing at it.

A kozo noren hangs on a wooden rod, backlit through a shoji, dyed in the Mesa
Forge purples. Three panels, freed by slits in the cloth, sway on their own
beat. It is the same world as the welcome backdrop — one object, lit, in a dark
room — and a deliberate contrast with the light Bauhaus plates a voter actually
marks.

### Provenance

| | |
| --- | --- |
| Retrieved from | `https://threeui.com/source-code/woven-cloth.json` |
| Variant | `washi` (revision SHA-256 `9bfd56ef7579`) |
| Vendored verbatim at | `apps/web/vendor/threeui/woven-cloth/` (see the README) |
| Hashes | all seven registered files match the SHA-256 published in the brief |
| Re-checked by | `src/shaders/__tests__/norenSource.test.ts`, every test run |

Nothing was eyeballed from the preview. `scripts/build-noren-variant.mjs`
re-verifies the source hash, then applies an enumerated set of **content-only**
patches to produce `public/noren/forge-speeches.html`. The test diffs the
authored script against the derived one line by line and fails on any removal it
does not already know about, so the cloth simulation cannot quietly drift.

### What was changed, and why

| Change | Reason |
| --- | --- |
| Sleeve lettering | The authored cloth prints nothing on the uncut band above the rule. It now carries **FORGE STUDENTS**. That band is the one place a line can run the whole way across, because the alpha mask cuts the slits from `TH*BAND` downward. |
| Panel wording | **WOVEN** / **CLOTH** is the component's own wordmark. It reads **ELECTION** / **SPEECHES**. Both are eight letters, so the panels stay symmetrical; the type steps down from the authored 96/116 to 68/82 and re-centres on the katazome frame, because eight glyphs have to fit where five did. |
| Crest | The authored checkerboard *mon* is replaced by the school's mark. The authored **ring** around it is kept — it is what makes the centre panel read as a crest rather than a sticker. |
| The mark is stencilled, not stamped | The PNG is dark ink on white. Everything else printed on this cloth is the resist-dyed Lavender Mist `#F5EDFB`, and a white tile in the middle of a dyed noren reads as a mistake. The image's darkness becomes that tint instead, which is what katazome does to a sheet. |
| The vermilion seal removed | The authored cloth stamps a hanko at the foot of the centre panel. It is the component's own mark, it reads as a second logo under the school's, and a red block is the only thing on the cloth that competes with the crest for a room looking from the back. |
| Dyed in the Forge palette | The authored cloth is indigo under a paper lantern. A projected wall is the largest thing in the hall carrying the brand, so the vat becomes Amethyst → Royal Purple → Deep Aubergine (keeping the authored logic that the cloth is deeper where it was dipped longest), the print becomes Lavender Mist, and the crest ring becomes Orchid — which is the value the brand book names for the ring motif. See below for why this is a re-dye and not a filter. |
| three.js inlined | The authored document pulls r160 from `cdn.jsdelivr.net` at runtime. A hall projector must not depend on a third-party request, and the frame is sandboxed *without* `allow-same-origin`, so it could not fetch our own copy either. The file npm installs for `three@0.160.0` is **byte-identical** to the one jsdelivr serves from that URL; the build asserts it, so this is an inlining and not an engine change. |
| Redraw once the mark decodes | The authored file builds its `CanvasTexture` in one synchronous pass. An image decode is not synchronous, so the mark is printed onto the live cloth canvas afterwards and the texture re-uploaded. Without this the centre panel stays empty. |

Untouched: the Verlet cloth and the cut links that free the panels, the wind
model, the deckle edge and its alpha mask, the laid and chain lines, the kozo
fibres, the katazome frames, the rod and cords, the camera fit and the
reduced-motion path. Every geometry, timing and simulation number in the
authored file survives verbatim; what the dye changed is colour and nothing
else, which the test proves by blanking every colour literal and requiring the
line to still exist rather than by keeping a list of hexes.

### Why the dye is a re-dye and not a filter

`WovenCloth` exposes a `hue` prop that hue-rotates the frame in CSS. It is one
line and it is wrong: `hue-rotate` is a linear matrix approximation applied to
everything in the frame, so it takes the timber rod with it and lands the cloth
near the target rather than on it. Each surface is given its own value instead.

The **lighting had to move with the cloth**, which is the part that is easy to
miss. The authored rig is a warm amber lantern at intensity 3.6 behind a sheet
with transmission 0.82 — amber light through a violet sheet is brown. The
lantern, key, fill, ambient and shoji glow are all re-tinted, and the material's
blue `attenuationColor` and `sheenColor` go with them, because a violet cloth
read through a blue tint is muddy. Every intensity and position is the authored
number; only the colours moved.

The **rod and cords stay timber**. The palette has no brown, and they are the
only warm thing left — without them the frame is monochrome and the noren stops
reading as an object hanging in a room.

### Why there is no responsive layout

The wall has no CSS layout to scale, because everything it says is printed into
the **texture**. The authored `fit()` rebuilds the camera on every resize and
takes the larger of a vertical and a horizontal fit, so the whole noren is in
frame at any aspect. Verified in Chrome at 1080×720, 1280×800, 1440×900,
1600×900, 1920×1080 and 1920×1200: the cloth is fully visible at each, and
`scrollHeight`/`scrollWidth` never exceed the viewport — the 100vh, no-scroll
requirement holds without a breakpoint.

### Two deliberate deviations from the authored integration

1. **Served from `/public` via `src`, not inlined via `srcDoc`.** Same trade as
   §5: the authored `WovenCloth` imports every variant with `?raw`, which with
   three.js inlined is ~2 MB of JavaScript in the bundle. The component in
   `components/noren/WovenCloth.tsx` keeps the authored prop contract, clamps,
   filter and sandbox exactly, and points at the derived document instead.
2. **A separate Vite entry, not a route.** `wall.html` and `index.html` are
   built as two pages. Sharing an entry would put a 3D scene in the voting
   bundle and the voting machine in the projector's, and neither wants the
   other.

   It is reached at **`/wall`**, without the extension, because it is a URL
   somebody types into a projector-room browser on the day. Vite's dev and
   preview servers map a bare path to `index.html`, and the production server
   has an SPA catch-all that does the same, so all three would quietly hand the
   projector the ballot. A rewrite in `vite.config.ts` and a named route in
   `apps/server/src/http/app.ts` take the path before either fallback sees it.

### `X-Frame-Options: DENY` blocked the artwork, and only once deployed

The server sets `X-Frame-Options: DENY` on every response. That is right for a
ballot — it must never be embeddable — but DENY is absolute: it refuses the
frame to the **same origin** too. Both this wall and the §5 welcome backdrop
load their scene in an `<iframe>` from our own origin, so a production
deployment rendered Chrome's blocked-content placeholder instead of the scene.

Development has no such header, which is exactly why it survived to here. Found
by serving the real build behind the real middleware and looking at it.

`/paper` and `/noren` are now narrowed to `SAMEORIGIN`; everything else, the two
pages included, stays `DENY`. Those two prefixes are inert artwork — no data, no
API call, no session — and the frames that load them are sandboxed without
`allow-same-origin`, so they cannot reach back out. `apps/server/src/__tests__/wall.test.ts`
pins both halves of that.

On a machine with no usable WebGL the wall falls back to the same three words
in HTML. A black rectangle on a projector is not an option, and `onLoad` cannot
tell us — the frame's document loads perfectly happily over a void, which is why
the check is asked in the parent.

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

## 6b. Every position is the same size

The candidate grid takes its **column count from the field**, not from the space
available. `columnsFor()` in `CandidateGrid.tsx`; the height is fixed by the
photo rather than by an aspect ratio, so a card that widens does not also grow
taller.

Three attempts got this wrong, each in a different way, and the reasons are
worth keeping because they are not obvious.

1. **`minmax(214px, 1fr)`** shared the row out between however many candidates
   stood. Four gave sensible cards; two gave two very wide ones — and since the
   portrait was 4:5, a wider card was a **taller** card. The positions with the
   fewest candidates produced the tallest pages.
2. **A pinned width** fixed the height but left a two-candidate position looking
   sparse, with most of the plate empty.
3. **`minmax(158px, 300px)`** was meant to do both. In a 1024px plate it fitted
   *three* cards across and orphaned the fourth onto a row of its own: a block
   of empty plate beside one lonely candidate, and a President page (4 standing)
   ~1000px tall against ~690px for a House Captain page (2 standing). The page
   was still resizing under the voter at every step — the exact fault this
   section claimed to have fixed, reintroduced by the fix.

**`auto-fit` cannot do this job at all**, which is the part worth writing down.
Its repetition count is computed from the track's *maximum* wherever that
maximum is definite — so `minmax(158px, 300px)` fits by the 300, and a 768px
tablet got exactly **one** card with the rest of the plate empty. Making the
maximum flexible (`1fr`) fixes the count but hands the decision back to the
space, which is what orphaned the fourth card to begin with. Neither option was
ever available.

So the count is chosen explicitly, at three tiers:

| Width | Columns | Why |
| --- | --- | --- |
| < 480px | 1 | Two 144px cards wrap most of these names onto three lines. |
| 480–939px | `columnsForNarrow` — up to 3, else 2 | Four across falls under 190px a card. |
| ≥ 940px | `columnsFor` — up to 4 | 940 is where a four-card row still clears 190px each. |

This election runs fields of 2, 3 and 4, so on a laptop every position is a
single row and every plate is genuinely the same height. Beyond four the count
balances the rows rather than leaving a remainder.

The breakpoints are measured, not guessed: at 768px — an iPad in portrait — the
940 tier would hand out four 148px cards carrying a 232px portrait each.

## 6d. The action bar is sticky, and that is not decoration

`.action-bar` in `global.css`. Measured in Chrome at the sizes this runs on:

| | Review plate | Submit button |
| --- | --- | --- |
| 1440 x 900 | 1035px | 11px below the fold |
| 1366 x 768 | 1035px | **143px below the fold** |
| 390 x 844 | 1715px (position) | ~860px below the fold |

1366x768 is the ordinary lab laptop. A voter reached the end of their ballot,
saw a white plate that simply *stopped* — no scrollbar hint, no fade, no cut-off
row to imply more — and had no way to finish voting except to guess at scrolling
or call the invigilator. A ballot that cannot be cast is the worst failure this
interface has.

Two consequences worth knowing before touching those screens:

- **The plate cannot use `overflow: hidden`.** It would become the sticky
  element's scroll container, and the bar would stick to the panel instead of to
  the window — which is to say, not at all.
- **Only the buttons stick on the review screen**, not the warning above them.
  Pinning the warning would cost a quarter of a 768px screen permanently, and it
  is restated in the confirmation dialog, which nothing gets past.

## 6e. One rule per signal

Four places had grown a treatment *per use* rather than a rule. A voter cannot
learn what a signal means if it means something different each time it appears.

**Colour means house. Nothing else.** The identity pass carried `STUDENT` as a
black field, `KNIGHTS` as a house field and `7 POSITIONS` as a yellow one, side
by side in one row — three treatments, chosen a tag at a time. `Tag` now takes
an ink field, a paper one when it sits on ink, or a house colour; `color` is for
house identity only. The third tag is gone: how many positions are on a ballot
is a fact, not an identity, and the sentence beneath it already said so.

The same rule fixed two colour bugs it exposed. `Avatar` defaulted to
`--bh-blue`, which is *also* the Samurai field — so on the check-in desk, where
every student's avatar carries their real house, the one voter with **no** house
was the one being coloured as if she had one. The default is neutral now. And on
the identity pass the avatar took the house colour while sitting **on** the house
field, so it had nothing to stand against and read as an empty outline.

**A crest on a colour field sits on paper.** The crests are black shields, and a
black shield on the Knights field (`#BE3A2B`) all but disappeared — the one
house whose own plate failed to show its own crest. `HouseCrest` takes
`onField`, which mounts it on a paper block. Fixing it in the component rather
than in the artwork matters: the shields are shared with the printed ballot.

**A heavy keyline bounds a plate, not every row of a list.** Check-in gave each
of eight results its own 3px keyline, so a search produced eight heavy black
boxes stacked up the first screen past the landing page. One bounded block with
hairlines inside it now. The right-hand slot carries the voter's **house**, with
its crest, instead of the word `STUDENT` eight times — eight identical tags told
a voter nothing, while a house is the thing that actually separates two people
with similar names. It is the real case here: *Adithya Rajagopalan* and *Adnaan
R* are both "AR" and both mask to `ad•••@forge27.mesaschool.co`. Anyone with no
house keeps the type tag, which is then the exception it was meant to be.

**A control must look like one.** The `quiet` variant was transparent,
borderless and set at label weight, so the seven `CHANGE` controls on review,
`Not you? Start again` and check-in's `Back` all read as static text. On a touch
kiosk there is no hover to discover them with. They are underlined now — enough
to say "this is a control" without giving it the weight of a block, which is the
whole point of the variant.

### The masking, while we were there

`maskEmail` repeated one dot per hidden character, which published the exact
length of every local part on a roll that is already searchable by prefix. These
addresses are `firstname_lastname@`, so that was routinely twelve or more dots
above a domain identical on every row — most of the visual weight of the row,
carrying almost none of its information. The run is fixed at three now: better
on both counts, and asserted by test.

## 6f. The handoff out of the dark room

Welcome is a dark full-bleed scene and the ballot is cream paper. The two worlds
are deliberate (§5), but the change between them was a **cut** — one frame
black, the next cream — which made them read as two different applications
rather than as one moving from the room onto the page.

Two things were wrong and both are fixed. The dark screen was being rendered
*inside* the page's cream padding, so a turning sheet in a dark room sat in a
cream picture frame; the welcome screen is full-bleed now and everything else
keeps the frame. And the ground no longer cuts: `.ground-lift` holds the dark
for a beat and lifts it. It is a fixed overlay with `pointer-events: none`,
mounted only on the way out of welcome and unmounted by its own `animationend`,
so nothing in the ballot depends on it and it cannot swallow a tap on the
check-in field underneath. Never mounted under reduced motion.

**The ballot stays light, and that is not a preference.** `PAPER` is the default
argument to `readableOn()` and `roleFor()` in `lib/color.ts` — every text colour
in the system is derived against it, and `contrast.test.ts` asserts all of them
against it. On `#08080a` every one of them fails AA:

| token | on paper | on `#08080a` |
| --- | --- | --- |
| `--bh-red-text` | 4.56 | 3.76 |
| `--bh-blue-text` | 6.96 | 2.46 |
| `--bh-yellow-text` | 4.52 | 3.79 |
| `--bh-green-text` | 4.56 | 3.76 |
| `--color-ink` | 15.77 | 1.09 |
| `--color-ink-soft` | 7.18 | 2.39 |

`--bh-yellow-text` (`#876707`) exists *only* because yellow has to be darkened
that far to survive on cream; on dark it is worse than useless. Two of the four
house colours also fail as text there (Samurai 3.31, Knights 3.65). Add to that
a white plate at 20:1 to stare at in a bright hall, 145 portraits lit for print,
and §8's ban on the glow and blur that normally make dark interfaces cohere.

Matching the ballot to the backdrop would mean rebuilding the palette. Matching
the *handoff* costs an overlay.

## 6c. Voice

Warm and precise. Short sentences, second person, no jargon, no exclamation
marks, no filler. Say what happened, then what to do about it. Never be cute
about the vote itself — the warmth belongs to the person, the precision to the
act.

Two rules decide most wording:

- **Errors lead with what it means for the voter**, not with what failed.
  *"Your vote was not recorded, and nothing has been saved. Try again — and if
  it fails a second time, tell the person running the election."*
- **Nothing implies the voter chose well.** We celebrate turning up, never the
  choice.

Everything a voter reads under pressure is in `src/lib/copy.ts` so it cannot be
softened by accident. The review warning is required verbatim and is asserted
by test.

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

- No gradient that reads as a gradient, no glow, no glassmorphism, no blur —
  **with one stated exception: the check-in aurora.** See §5c. The exception is
  written here rather than left as a silent contradiction between this list and
  the code, because this project has already been bitten once by exactly that:
  §7 of product-spec.md went on specifying `GATE CLOSED` long after §0 here
  recorded that direction as rejected, and the server kept implementing it.
- No rounded corners beyond the 2 px needed to stop a control looking broken.
- Colour is never the only carrier of meaning — not for selection, not for
  house identity, not for errors.
- Themed language never replaces plain language. Error headlines are sentences.
- Decoration never delays input and never gates a click.
- No sound. A shared room with a queue in it.
