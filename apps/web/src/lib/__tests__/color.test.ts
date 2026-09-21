import { describe, expect, it } from 'vitest';
import {
  AA_BODY,
  BLACK,
  PAPER,
  WHITE,
  contrastRatio,
  inkOn,
  parseHex,
  readableOn,
  relativeLuminance,
  roleFor,
  toHex,
} from '../color';

/** The four Bauhaus fields this election uses. */
const HOUSE_COLOURS = {
  samurai: '#DE2B1F',
  knights: '#1B4D9B',
  vikings: '#1E7A4C',
  gladiators: '#FFC20E',
};

describe('colour maths', () => {
  it('matches known WCAG reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // The canonical "web-safe" mid grey.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeGreaterThanOrEqual(4.47);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#DE2B1F', PAPER)).toBeCloseTo(contrastRatio(PAPER, '#DE2B1F'), 10);
  });

  it('round-trips hex', () => {
    expect(toHex(parseHex('#DE2B1F'))).toBe('#de2b1f');
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
  });

  it('orders luminance as expected', () => {
    expect(relativeLuminance('#FFFFFF')).toBeGreaterThan(relativeLuminance('#FFC20E'));
    expect(relativeLuminance('#FFC20E')).toBeGreaterThan(relativeLuminance('#1B4D9B'));
  });
});

describe('inkOn — type goes on a field as black or white, never a tint', () => {
  it('puts black on yellow', () => {
    expect(inkOn(HOUSE_COLOURS.gladiators)).toBe(BLACK);
  });

  it('puts white on deep blue', () => {
    expect(inkOn(HOUSE_COLOURS.knights)).toBe(WHITE);
  });

  it('always clears AA on the field it chose', () => {
    for (const colour of Object.values(HOUSE_COLOURS)) {
      expect(contrastRatio(inkOn(colour), colour)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});

describe('readableOn — a colour used as text is darkened until it passes', () => {
  it('leaves an already-readable colour untouched', () => {
    const blue = HOUSE_COLOURS.knights;
    expect(readableOn(blue)).toBe(blue);
  });

  it('rescues Bauhaus yellow, which is hopeless as text at full strength', () => {
    const yellow = HOUSE_COLOURS.gladiators;
    // The premise: raw yellow is unreadable on paper.
    expect(contrastRatio(yellow, PAPER)).toBeLessThan(2);
    // The fix: a darkened yellow that passes.
    expect(contrastRatio(readableOn(yellow), PAPER)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('rescues every house colour', () => {
    for (const [house, colour] of Object.entries(HOUSE_COLOURS)) {
      const text = readableOn(colour);
      expect(
        contrastRatio(text, PAPER),
        `${house} text (${text}) on paper`,
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('preserves the hue, so a darkened yellow still reads as that house', () => {
    const [r, g, b] = parseHex(readableOn(HOUSE_COLOURS.gladiators));
    // Still yellow: red and green high relative to blue.
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it('is deterministic', () => {
    expect(readableOn('#FFC20E')).toBe(readableOn('#FFC20E'));
  });

  it('honours a stricter target', () => {
    const strict = readableOn('#DE2B1F', PAPER, 7);
    expect(contrastRatio(strict, PAPER)).toBeGreaterThanOrEqual(7);
  });
});

describe('roleFor — one configured colour, four derived uses', () => {
  it('derives a complete, accessible role for every house', () => {
    for (const [house, colour] of Object.entries(HOUSE_COLOURS)) {
      const role = roleFor(colour);

      expect(role.field, house).toBe(colour);
      expect(contrastRatio(role.onField, role.field), `${house} ink on field`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
      expect(contrastRatio(role.text, PAPER), `${house} text on paper`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
      // A wash is a background; body ink must stay readable on it.
      expect(contrastRatio(BLACK, role.wash), `${house} ink on wash`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });

  it('produces a wash that is close to paper, not a second field', () => {
    const role = roleFor(HOUSE_COLOURS.samurai);
    expect(relativeLuminance(role.wash)).toBeGreaterThan(relativeLuminance(role.field));
    expect(contrastRatio(role.wash, PAPER)).toBeLessThan(1.5);
  });
});
