/**
 * Colour utilities for a bold palette.
 *
 * Bauhaus primaries are saturated and light-hungry: yellow at full strength sits
 * at roughly 1.4:1 against paper, which is unreadable as text. The rule that
 * makes the palette work is therefore:
 *
 *   **A colour is a FIELD, not ink.**
 *
 * Saturated colour fills a block; the text on that block is black or white,
 * chosen by luminance. When a colour must appear *as text* on paper, it is
 * darkened until it passes. Both operations live here, are pure, and are unit
 * tested, so a house colour chosen by whoever runs the election cannot quietly
 * ship an unreadable screen.
 */

// The grounds live in ./ground so that module can have no imports and this one
// can depend on it; the reverse would be a cycle. Re-exported here because
// PAPER is what every caller that names a ground explicitly wants.
export { PAPER, NIGHT } from './ground';
import { TYPE_SURFACE } from './ground';

export const BLACK = '#141414';
export const WHITE = '#FFFFFF';

/** Is this ground light enough that readable text has to go darker, not lighter? */
export function isLightGround(background: string): boolean {
  return relativeLuminance(background) > 0.2;
}

export const AA_BODY = 4.5;
export const AA_LARGE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Black or white, whichever is more readable on `field`.
 *
 * Bauhaus posters do exactly this: type on a colour block is one or the other,
 * never a tint of the block.
 */
export function inkOn(field: string): typeof BLACK | typeof WHITE {
  return contrastRatio(BLACK, field) >= contrastRatio(WHITE, field) ? BLACK : WHITE;
}

/**
 * Move `colour` AWAY from `background` until it is readable as text on it.
 *
 * Hue is preserved — a shifted Bauhaus yellow still reads as that house's
 * yellow — while lightness moves in small steps until the ratio passes.
 *
 * THE DIRECTION IS CHOSEN BY THE GROUND, and it has to be. This used to darken
 * unconditionally, which is correct on paper and exactly backwards on a dark
 * ground: `--bh-yellow-text` is `#876707` precisely because yellow must be
 * darkened that far to survive on cream, and that same value is 3.79:1 on
 * #0E0E10. Darkening a colour to make it legible against black produces
 * something less legible than what you started with.
 *
 * Returns the extreme of whichever direction it was travelling if nothing in
 * between passes, which cannot happen for a real colour.
 */
export function readableOn(
  colour: string,
  background: string = TYPE_SURFACE,
  minRatio: number = AA_BODY,
): string {
  if (contrastRatio(colour, background) >= minRatio) return colour;

  const [r, g, b] = parseHex(colour);
  const darken = isLightGround(background);

  for (let step = 1; step <= 100; step += 1) {
    const amount = step / 100;
    const candidate = darken
      ? toHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)])
      : toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return darken ? BLACK : WHITE;
}

/**
 * A block of colour that is guaranteed to carry legible type.
 *
 * Mid-tone brand colours are the awkward case: a colour can sit where NEITHER
 * black nor white reaches AA on it. The real Gladiators green is exactly this —
 * white on it is 4.47:1, black is worse. Choosing the "best" ink there still
 * ships a field nobody can read.
 *
 * So when the raw colour cannot carry either ink, the FIELD moves instead:
 * darkened until white passes, or lightened until black does, whichever needs
 * the smaller shift, so it still reads as that house's colour.
 */
export function accessibleField(
  colour: string,
  minRatio: number = AA_BODY,
): { field: string; ink: string } {
  const ink = inkOn(colour);
  if (contrastRatio(ink, colour) >= minRatio) return { field: colour, ink };

  const [r, g, b] = parseHex(colour);

  let darker: string | null = null;
  for (let step = 1; step <= 100; step += 1) {
    const f = 1 - step / 100;
    const candidate = toHex([r * f, g * f, b * f]);
    if (contrastRatio(WHITE, candidate) >= minRatio) {
      darker = candidate;
      break;
    }
  }

  let lighter: string | null = null;
  for (let step = 1; step <= 100; step += 1) {
    const f = step / 100;
    const candidate = toHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f]);
    if (contrastRatio(BLACK, candidate) >= minRatio) {
      lighter = candidate;
      break;
    }
  }

  // Prefer whichever moved the luminance least — that is the one that still
  // looks like the original.
  const base = relativeLuminance(colour);
  const darkShift = darker ? Math.abs(relativeLuminance(darker) - base) : Infinity;
  const lightShift = lighter ? Math.abs(relativeLuminance(lighter) - base) : Infinity;

  if (darker && darkShift <= lightShift) return { field: darker, ink: WHITE };
  if (lighter) return { field: lighter, ink: BLACK };
  return { field: BLACK, ink: WHITE };
}

/** A house's full presentation, derived once from its single configured colour. */
export interface ColourRole {
  /** The crest colour, untouched. For shapes, bars and rules — never type. */
  brand: string;
  /** A block that is guaranteed to carry `onField` legibly. May be adjusted. */
  field: string;
  /** Black or white — what goes ON the field. */
  onField: string;
  /** The same hue, darkened until it is readable as text on paper. */
  text: string;
  /** A pale wash of the hue, for a selected row's background. */
  wash: string;
}

export function roleFor(colour: string, background: string = TYPE_SURFACE): ColourRole {
  const [r, g, b] = parseHex(colour);
  const mix = (amount: number): string =>
    toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);

  const { field, ink } = accessibleField(colour);

  return {
    brand: colour,
    field,
    onField: ink,
    text: readableOn(colour, background),
    wash: mix(0.86),
  };
}
