# Third-party notices

## React Bits — `SplitFlapText` (no longer used)

An earlier design direction ("Mesa Departures") adapted the flip mechanic from
React Bits' `SplitFlapText`. That direction was dropped in favour of the paper
and ink design in `docs/design-direction.md`, and the derived component and
stylesheet were removed with it. No React Bits code remains in this repository.

Recorded here because the attribution existed in earlier commits:
React Bits — MIT + Commons Clause License Condition v1.0, © David Haz,
https://github.com/DavidHDev/react-bits

## Runtime dependencies

| Package | Licence | Used for |
| --- | --- | --- |
| react, react-dom | MIT | UI |
| zod | MIT | schema validation at every boundary |
| express | MIT | HTTP layer |
| better-sqlite3 | MIT | authoritative store |
| dotenv | BSD-2-Clause | environment loading |
| tailwindcss | MIT | styling utilities |
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

## Evaluated and not used

`bauhaus-avatar-generator` (MIT) and `bauhaus-ui-library` (MIT) were both
reviewed while designing the current direction. Neither is used; the reasoning
is recorded in `docs/design-direction.md` §7.

The `three` npm package was used for an earlier Bauhaus WebGL piece and has been
removed: the ThreeUI frame embeds its own copy of three.js, so a second one in
the application bundle was pure weight.
