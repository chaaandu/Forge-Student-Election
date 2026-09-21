# Third-party notices

## React Bits — `SplitFlapText`

The flip mechanic in `apps/web/src/components/board/SplitFlap.tsx` and the tile
geometry in `apps/web/src/styles/splitflap.css` are adapted from React Bits'
`SplitFlapText` component.

- Source: https://reactbits.dev · https://github.com/DavidHDev/react-bits
- Licence: MIT + Commons Clause License Condition v1.0
- Copyright © David Haz

The Commons Clause permits use in an application or product, including
commercially, and prohibits selling or redistributing the components
themselves. This repository uses the mechanic inside an application; it does not
redistribute React Bits components as a library.

**What was changed and why** (see ADR-7 in `docs/architecture.md`): the original
is an uncontrolled marquee that cycles through a word list on a timer and
exposes its animated characters to assistive technology. This project needs the
opposite on all three counts, so it was re-implemented in TypeScript as a
controlled component driven by real application state, with the true text in a
visually-hidden layer, `aria-hidden` on the tiles, a complete
`prefers-reduced-motion` path, and injectable timing for tests.

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
| @fontsource-variable/inter | OFL-1.1 (Inter by Rasmus Andersson) | body typeface |
| @fontsource-variable/jetbrains-mono | OFL-1.1 (JetBrains Mono) | board typeface |

Candidate portraits in `apps/web/public/candidates/` are generated placeholder
SVGs containing initials only. They depict no real person.
