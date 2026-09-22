export type Ground = 'paper' | 'night';

/** The light ground: warm poster stock. */
export const PAPER = '#F2EDE1';
/** The dark ground. */
export const NIGHT = '#0E0E10';

/**
 * Which ground the ballot is printed on.
 *
 * NIGHT IS THE DEFAULT. Set `VITE_GROUND=paper` for the light ballot, which
 * is kept working and fully tested rather than deleted: the substrate is the
 * only thing that differs, so keeping both costs one token block and proves
 * the palette is genuinely ground-independent rather than tuned to one page.
 *
 * Chosen once, at build time. Deliberately NOT a
 * runtime toggle: a kiosk in a hall has one appearance for the whole election,
 * and a theme a voter can flip is a setting nobody asked for on a screen that
 * should only ever offer one thing to do.
 *
 * WHY THIS EXISTS AT ALL, rather than living purely in CSS.
 *
 * Almost everything follows `--color-ink` and `--color-paper` and re-themes for
 * free — which is the dividend of "a colour is a field, not ink"
 * (design-direction §2.1). The exception is `roleFor(house.color).text`: a
 * house colour used AS TYPE, shifted until it passes AA against whatever is
 * behind it, computed in JavaScript from one configured hex. CSS cannot do
 * that, so the ground has to reach `color.ts`.
 *
 * It lives in its own module with NO IMPORTS so that `color.ts` can depend on
 * it. The other way round is a cycle.
 */
export const GROUND: Ground = import.meta.env.VITE_GROUND === 'paper' ? 'paper' : 'night';

/** The page colour, behind everything. */
export const GROUND_COLOUR: string = GROUND === 'night' ? NIGHT : PAPER;

/**
 * The WORST-CASE surface for type on this ground, which is what `readableOn`
 * and `roleFor` measure against by default.
 *
 * Not simply "the plate". Type is drawn on the page, on plates and in sunken
 * wells, and the hardest of those to read on is whichever sits closest in
 * luminance to the type itself:
 *
 *   paper — type is DARK, so the worst case is the DARKEST surface. The page
 *           (#F2EDE1) is darker than a plate (#FFFFFF).
 *   night — type is LIGHT, so the worst case is the LIGHTEST surface. A plate
 *           (#1A1A1E) is lighter than the page (#0E0E10).
 *
 * Getting this backwards is silent and it is not symmetric, which is why it is
 * written down. Deriving against the plate on paper produced colours that
 * cleared 4.5:1 on white and then landed at 3.86:1 on the actual page — the
 * Gladiators green, "checked" and failing. Three separate test files caught it
 * at once, which is the only reason it is not in this comment as a shipped bug.
 */
export const TYPE_SURFACE: string = GROUND === 'night' ? '#1A1A1E' : PAPER;
