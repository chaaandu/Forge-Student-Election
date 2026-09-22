# Third-party notices

## React Bits — `Aurora`

React Bits — **MIT + Commons Clause License Condition v1.0**, © David Haz,
https://github.com/DavidHDev/react-bits

**This is not plain MIT.** The Commons Clause withholds the right to *sell* the
software, or to sell a product whose value derives entirely from it. Mesa runs
this election system for itself and does not sell it, so the condition is not
engaged. It is called out because the distinction matters if this is ever
licensed to another school, and because a reader skimming a licence table would
otherwise see "MIT" and stop.

- Component: `Aurora` — https://reactbits.dev/backgrounds/aurora
- Vendored at `apps/web/src/components/backdrop/Aurora.tsx` + `Aurora.css`
- The vertex and fragment shaders, including the simplex noise and the colour
  ramp, are the published source unchanged. What was changed is recorded in the
  file header: TypeScript, the unused `lightMode` path removed, and three kiosk
  gates added (WebGL, reduced motion, tab visibility).

### An earlier React Bits component, since removed

The first design direction ("Mesa Departures") adapted the flip mechanic from
React Bits' `SplitFlapText`. That direction was dropped in favour of the design
in `docs/design-direction.md` and the derived component was removed with it.

This section previously claimed that no React Bits code remained in the
repository. That claim is out of date and has been replaced rather than left to
rot: a notices file that is confidently wrong is worse than one that is missing,
and a test now fails if the old sentence reappears.

## Runtime dependencies

| Package | Licence | Used for |
| --- | --- | --- |
| react, react-dom | MIT | UI |
| zod | MIT | schema validation at every boundary |
| express | MIT | HTTP layer |
| better-sqlite3 | MIT | authoritative store |
| dotenv | BSD-2-Clause | environment loading |
| tailwindcss | MIT | styling utilities |
| ogl | Unlicense (public domain) | WebGL for the check-in aurora; lazy-loaded, ~15 KB gzipped, never in the first chunk |
| vite | MIT | build tooling |
| @fontsource/staatliches | OFL-1.1 | poster headlines — Google's digitisation of Herbert Bayer's title lettering for the 1923 Bauhaus exhibition catalogue |
| @fontsource-variable/jost | OFL-1.1 (Jost* by indestructible type*) | labels, numerals, controls — an open Futura |
| @fontsource-variable/inter | OFL-1.1 (Inter by Rasmus Andersson) | candidate names and body copy |

Candidate portraits in `apps/web/public/candidates/` are generated placeholder
SVGs containing initials only. They depict no real person, and are replaced when
real photographs are supplied.

## ThreeUI — `3d-paper`

The welcome screen's backdrop is ThreeUI's `3d-paper` component, integrated from
its registered source rather than reproduced.

- Source: https://threeui.com/three-js/3d-paper/site-of-the-year
- Registry: `https://threeui.com/source-code/3d-paper.json`
- Package: `@designcodeio/threeui` — licence in that package's `LICENSE`
- Vendored verbatim at `apps/web/vendor/threeui/`, with `SOURCE.json` recording
  every file's size and SHA-256. All six match the hashes published in the
  integration brief, and a test re-checks them on every run.

The served document `apps/web/public/paper/mesa-elections.html` is **derived**
from `3d-paper-site-of-the-year.html` by `scripts/build-paper-variant.mjs`,
which applies content-only patches. The `<script>` block containing three.js
r149 and the paper simulation is byte-identical to the authored source; a test
asserts this.

The vendored documents embed **three.js r149** — MIT, © three.js authors.

## ThreeUI — `woven-cloth`

The speeches wall is ThreeUI's `woven-cloth` component, `washi` variant,
integrated from its registered source rather than reproduced.

- Source: https://threeui.com/three-js/woven-cloth
- Registry: `https://threeui.com/source-code/woven-cloth.json`
- Revision: SHA-256 `9bfd56ef7579`
- Package: `@designcodeio/threeui` — licence in that package's `LICENSE`
- Vendored verbatim at `apps/web/vendor/threeui/woven-cloth/`, with
  `SOURCE.json` recording every file's size and SHA-256. All seven match the
  hashes published in the integration brief, and a test re-checks them on every
  run.

The served document `apps/web/public/noren/forge-speeches.html` is **derived**
from `woven-cloth-washi.html` by `scripts/build-noren-variant.mjs`, which
applies content-only patches. A test diffs the authored script against the
derived one line by line and fails on any removal it has not been told about.

That document embeds **three.js r160** — MIT, © three.js authors. The authored
source loads it from `cdn.jsdelivr.net` at runtime; it is inlined here so a hall
projector needs no network. The inlined bundle is byte-for-byte the file npm
publishes for `three@0.160.0`, which is what jsdelivr serves from that URL, and
the build asserts the hash before inlining.

## Evaluated and not used

`bauhaus-avatar-generator` (MIT) and `bauhaus-ui-library` (MIT) were both
reviewed while designing the current direction. Neither is used; the reasoning
is recorded in `docs/design-direction.md` §7.

The `three` npm package was used for an earlier Bauhaus WebGL piece and has been
removed from the application: the ThreeUI frames embed their own copies of
three.js, so a second one in the bundle was pure weight. It remains a
**devDependency**, and nothing imports it — the noren build reads
`node_modules/three/build/three.min.js` off disk to inline it into a static
document, so it never reaches a browser through the bundle.
