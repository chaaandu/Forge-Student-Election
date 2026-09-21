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
| three | MIT | the decorative WebGL composition on the welcome screen, lazily loaded and never in the app bundle |
| tailwindcss | MIT | styling utilities |
| vite | MIT | build tooling |
| @fontsource/staatliches | OFL-1.1 | poster headlines — Google's digitisation of Herbert Bayer's title lettering for the 1923 Bauhaus exhibition catalogue |
| @fontsource-variable/jost | OFL-1.1 (Jost* by indestructible type*) | labels, numerals, controls — an open Futura |
| @fontsource-variable/inter | OFL-1.1 (Inter by Rasmus Andersson) | candidate names and body copy |

Candidate portraits in `apps/web/public/candidates/` are generated placeholder
SVGs containing initials only. They depict no real person, and are replaced when
real photographs are supplied.

## Evaluated and not used

`bauhaus-avatar-generator` (MIT) and `bauhaus-ui-library` (MIT) were both
reviewed while designing the current direction. Neither is used; the reasoning
is recorded in `docs/design-direction.md` §7.
