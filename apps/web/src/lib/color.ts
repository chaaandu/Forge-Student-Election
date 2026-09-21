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

export const PAPER = '#F2EDE1';
export const BLACK = '#141414';
export const WHITE = '#FFFFFF';

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
 * Darken `colour` until it is readable as text on `background`.
 *
 * Hue is preserved — a darkened Bauhaus yellow still reads as that house's
 * yellow — while lightness is reduced in small steps until the ratio passes.
 * Returns black in the (impossible for real colours) case that nothing does.
 */
export function readableOn(
  colour: string,
  background: string = PAPER,
  minRatio: number = AA_BODY,
): string {
  if (contrastRatio(colour, background) >= minRatio) return colour;

  const [r, g, b] = parseHex(colour);
  for (let step = 1; step <= 100; step += 1) {
    const factor = 1 - step / 100;
    const candidate = toHex([r * factor, g * factor, b * factor]);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return BLACK;
}

/** A house's full presentation, derived once from its single configured colour. */
export interface ColourRole {
  /** The saturated block. Never used for text. */
  field: string;
  /** Black or white — what goes ON the field. */
  onField: string;
  /** The same hue, darkened until it is readable as text on paper. */
  text: string;
  /** A pale wash of the hue, for a selected row's background. */
  wash: string;
}

export function roleFor(colour: string, background: string = PAPER): ColourRole {
  const [r, g, b] = parseHex(colour);
  const mix = (amount: number): string =>
    toHex([
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount,
    ]);

  return {
    field: colour,
    onField: inkOn(colour),
    text: readableOn(colour, background),
    wash: mix(0.86),
  };
}
