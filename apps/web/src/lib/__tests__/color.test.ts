import { describe, expect, it } from 'vitest';
import {
  AA_BODY,
  BLACK,
  PAPER,
  WHITE,
  accessibleField,
  contrastRatio,
  inkOn,
  parseHex,
  readableOn,
  relativeLuminance,
  roleFor,
  toHex,
} from '../color';

/** The four house colours, sampled from the real crests. */
const HOUSE_COLOURS = {
  samurai: '#2F57A8',
  knights: '#B83325',
  gladiators: '#628838',
  vikings: '#EEC048',
};

/** A mid-tone that carries NEITHER black nor white at AA. The hard case. */
const AWKWARD_MIDTONE = '#628838';

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
  it('puts black on gold', () => {
    expect(inkOn(HOUSE_COLOURS.vikings)).toBe(BLACK);
  });

  it('puts white on deep blue', () => {
    expect(inkOn(HOUSE_COLOURS.samurai)).toBe(WHITE);
  });

  it('picks the better ink, which is NOT the same as a legible one', () => {
    // The honest contract: inkOn answers "which is closer", not "is this
    // readable". For a mid-tone neither answer clears AA, and pretending
    // otherwise is how an unreadable block ships. accessibleField is the
    // function that guarantees legibility.
    const best = inkOn(AWKWARD_MIDTONE);
    const other = best === BLACK ? WHITE : BLACK;
    expect(contrastRatio(best, AWKWARD_MIDTONE)).toBeGreaterThan(
      contrastRatio(other, AWKWARD_MIDTONE),
    );
    expect(contrastRatio(best, AWKWARD_MIDTONE)).toBeLessThan(AA_BODY);
  });
});

/**
 * These name their ground explicitly.
 *
 * They used to rely on the DEFAULT being paper, which quietly coupled a unit
 * test of a pure function to whichever theme the app happened to ship. When
 * night became the default they all failed at once — correctly: `readableOn`
 * shifts a colour AWAY from its ground, so with no ground named they were
 * asserting that a colour lightened for a dark page is legible on a light one.
 */
describe('readableOn — a colour used as text is moved until it passes', () => {
  it('leaves an already-readable colour untouched', () => {
    const blue = HOUSE_COLOURS.knights;
    expect(readableOn(blue, PAPER)).toBe(blue);
  });

  it('rescues the Vikings gold, which is hopeless as text at full strength', () => {
    const gold = HOUSE_COLOURS.vikings;
    // The premise: the raw gold is unreadable on paper.
    expect(contrastRatio(gold, PAPER)).toBeLessThan(2);
    // The fix: a darkened gold that passes.
    expect(contrastRatio(readableOn(gold, PAPER), PAPER)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('rescues every house colour sampled from the real crests', () => {
    for (const [house, colour] of Object.entries(HOUSE_COLOURS)) {
      const text = readableOn(colour, PAPER);
      expect(
        contrastRatio(text, PAPER),
        `${house} text (${text}) on paper`,
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('preserves the hue, so a darkened gold still reads as that house', () => {
    const [r, g, b] = parseHex(readableOn(HOUSE_COLOURS.vikings, PAPER));
    // Still gold: red and green high relative to blue.
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it('is deterministic', () => {
    expect(readableOn('#FFC20E', PAPER)).toBe(readableOn('#FFC20E', PAPER));
  });

  it('honours a stricter target', () => {
    const strict = readableOn(HOUSE_COLOURS.knights, PAPER, 7);
    expect(contrastRatio(strict, PAPER)).toBeGreaterThanOrEqual(7);
  });
});

describe('accessibleField — a block that is guaranteed to carry type', () => {
  it('leaves a colour alone when it already carries an ink', () => {
    const deepBlue = HOUSE_COLOURS.samurai;
    expect(accessibleField(deepBlue).field).toBe(deepBlue);
    expect(accessibleField(deepBlue).ink).toBe(WHITE);
  });

  it('proves the hard case exists: a mid-tone carries neither ink', () => {
    expect(contrastRatio(BLACK, AWKWARD_MIDTONE)).toBeLessThan(AA_BODY);
    expect(contrastRatio(WHITE, AWKWARD_MIDTONE)).toBeLessThan(AA_BODY);
  });

  it('moves the field rather than shipping an unreadable block', () => {
    const { field, ink } = accessibleField(AWKWARD_MIDTONE);
    expect(field).not.toBe(AWKWARD_MIDTONE);
    expect(contrastRatio(ink, field)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('keeps the hue, so an adjusted green still reads as that house', () => {
    const [r, g, b] = parseHex(accessibleField(AWKWARD_MIDTONE).field);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('never exceeds the minimum shift needed — it darkens or lightens, not both', () => {
    const before = relativeLuminance(AWKWARD_MIDTONE);
    const after = relativeLuminance(accessibleField(AWKWARD_MIDTONE).field);
    expect(Math.abs(after - before)).toBeLessThan(0.3);
  });

  it('carries type on every real house colour', () => {
    for (const [house, colour] of Object.entries(HOUSE_COLOURS)) {
      const { field, ink } = accessibleField(colour);
      expect(contrastRatio(ink, field), `${house} (${colour} → ${field})`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });
});

describe('roleFor — one configured colour, five derived uses', () => {
  it('derives a complete, accessible role for every house', () => {
    for (const [house, colour] of Object.entries(HOUSE_COLOURS)) {
      const role = roleFor(colour, PAPER);

      // `brand` is the crest colour untouched — shapes, bars and crests use it.
      expect(role.brand, house).toBe(colour);
      // `field` may differ: it is the block that must carry type.
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
    const role = roleFor(HOUSE_COLOURS.samurai, PAPER);
    expect(relativeLuminance(role.wash)).toBeGreaterThan(relativeLuminance(role.field));
    expect(contrastRatio(role.wash, PAPER)).toBeLessThan(1.5);
  });
});
