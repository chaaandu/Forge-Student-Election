// @vitest-environment node
//
// Runs in node rather than jsdom so the real stylesheet and the real election
// configuration can be read from disk. These assertions must check the files
// the app actually ships, not copies that can drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_BODY, AA_LARGE, contrastRatio, inkOn, readableOn, roleFor } from '../../lib/color';

const css = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`token --${name} not found or not a hex value`);
  return match[1];
}

const PAPER = token('color-paper');
const CARD = token('color-card');
const SUNK = token('color-sunk');

/**
 * The dark ground gets the same scrutiny as the light one.
 *
 * `token()` matches the first occurrence in the file, which is the `:root`
 * block, so it keeps returning the paper values. `nightToken()` reads the
 * `[data-ground='night']` block instead. Both grounds ship, so both are checked;
 * a theme nobody tests is a theme that fails on the one screen nobody opened.
 */
const nightBlock = css.slice(css.indexOf("[data-ground='night']"));
function nightToken(name: string): string {
  const match = nightBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`token --${name} not found in the night block`);
  return match[1];
}

/** Read once, at module scope, so both grounds can be checked against it. */
const config = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../server/config/election.config.json', import.meta.url)),
    'utf8',
  ),
) as { houses: { id: string; name: string; color: string; shape?: string }[] };

const NIGHT_PAGE = nightToken('color-paper');
const NIGHT_PLATE = nightToken('color-card');
const NIGHT_SUNK = nightToken('color-sunk');

/**
 * A bold palette fails in the opposite direction from a quiet one: saturated
 * colour looks confident on a designer's display and disappears as text under a
 * hall's overhead lights. Bauhaus yellow is the extreme case at 1.39:1 on paper.
 *
 * The rule under test: a colour is a FIELD, not ink.
 */
describe('ink on every surface', () => {
  const surfaces = [PAPER, CARD, SUNK];

  it.each(['color-ink', 'color-ink-soft'])('%s meets AA for body text everywhere', (name) => {
    for (const surface of surfaces) {
      const value = contrastRatio(token(name), surface);
      expect(value, `${name} on ${surface} is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });

  it('body ink is far beyond the minimum, because most reading happens here', () => {
    expect(contrastRatio(token('color-ink'), PAPER)).toBeGreaterThanOrEqual(12);
  });

  it('tertiary ink meets AA for large text only, and is documented as such', () => {
    expect(contrastRatio(token('color-ink-faint'), PAPER)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(css).toMatch(/--color-ink-faint[\s\S]{0,140}never body/);
  });
});

describe('primaries used as text are the darkened variants', () => {
  const pairs: [string, string][] = [
    ['bh-red', 'bh-red-text'],
    ['bh-blue', 'bh-blue-text'],
    ['bh-yellow', 'bh-yellow-text'],
    ['bh-green', 'bh-green-text'],
  ];

  it.each(pairs)('--%s has a text variant that passes AA on paper', (_field, textToken) => {
    const value = contrastRatio(token(textToken), PAPER);
    expect(value, `--${textToken} is ${value.toFixed(2)}:1 on paper`).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it('proves the premise: raw Bauhaus yellow is unusable as text', () => {
    expect(contrastRatio(token('bh-yellow'), PAPER)).toBeLessThan(2);
  });

  it('each text variant matches what readableOn() derives, so code and CSS agree', () => {
    for (const [field, textToken] of pairs) {
      expect(token(textToken).toLowerCase()).toBe(readableOn(token(field), PAPER).toLowerCase());
    }
  });
});

describe('primaries used as fields carry legible type', () => {
  it.each(['bh-red', 'bh-blue', 'bh-yellow', 'bh-green'])(
    'black or white on --%s clears AA',
    (name) => {
      const field = token(name);
      expect(contrastRatio(inkOn(field), field)).toBeGreaterThanOrEqual(AA_BODY);
    },
  );

  it('puts black on yellow and white on blue, as a poster would', () => {
    expect(inkOn(token('bh-yellow'))).toBe('#141414');
    expect(inkOn(token('bh-blue'))).toBe('#FFFFFF');
  });

  it('keeps the page and a panel distinguishable without relying on shadow', () => {
    expect(token('color-card')).not.toBe(token('color-paper'));
    expect(contrastRatio(CARD, PAPER)).toBeGreaterThan(1.03);
  });
});

/**
 * House colours are chosen by whoever runs the election, so they are validated
 * here rather than trusted. Every house must work as a field AND as text.
 */
describe('house identity', () => {
  it.each(config.houses.map((h) => [h.name, h.color] as const))(
    '%s works as a field and as text',
    (name, colour) => {
      const role = roleFor(colour, PAPER);
      expect(contrastRatio(role.onField, role.field), `${name}: ink on field`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
      expect(contrastRatio(role.text, PAPER), `${name}: text on paper`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    },
  );

  it('gives every house a distinct elementary form, so identity is never colour alone', () => {
    const shapes = config.houses.map((h) => h.shape);
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(config.houses.length);
  });

  it('gives every house a distinct colour too', () => {
    const colours = config.houses.map((h) => h.color.toLowerCase());
    expect(new Set(colours).size).toBe(config.houses.length);
  });
});

describe('reduced motion is wired into the tokens', () => {
  it('collapses the mark, the snap and every transition', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/--dur-mark:\s*1ms/);
    expect(block).toMatch(/--dur-snap:\s*1ms/);
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});

/**
 * The dark ground.
 *
 * Every assertion above, again, against a substrate that inverts. The text
 * variants here are NOT the light ones flipped: `readableOn()` shifts a colour
 * away from its ground, so on paper it darkens and here it lightens. The paper
 * yellow #876707 is 3.79:1 on this page; the raw #FFC20E is 10.7:1. Same hue,
 * opposite direction, and the reason the function had to learn which way to go.
 */
describe('the dark ground', () => {
  const surfaces = [NIGHT_PAGE, NIGHT_PLATE, NIGHT_SUNK];

  it.each(['color-ink', 'color-ink-soft'])('%s meets AA for body text everywhere', (name) => {
    for (const surface of surfaces) {
      const value = contrastRatio(nightToken(name), surface);
      expect(value, `${name} on ${surface} is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });

  it('body ink is far beyond the minimum here too', () => {
    expect(contrastRatio(nightToken('color-ink'), NIGHT_PLATE)).toBeGreaterThanOrEqual(12);
  });

  it('tertiary ink is large-text only, same as on paper', () => {
    expect(contrastRatio(nightToken('color-ink-faint'), NIGHT_PLATE)).toBeGreaterThanOrEqual(
      AA_LARGE,
    );
  });

  const pairs: [string, string][] = [
    ['bh-red', 'bh-red-text'],
    ['bh-blue', 'bh-blue-text'],
    ['bh-yellow', 'bh-yellow-text'],
    ['bh-green', 'bh-green-text'],
  ];

  it.each(pairs)('--%s has a text variant that passes AA on every dark surface', (_f, textToken) => {
    for (const surface of surfaces) {
      const value = contrastRatio(nightToken(textToken), surface);
      expect(value, `--${textToken} is ${value.toFixed(2)}:1 on ${surface}`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });

  it('derives them by LIGHTENING, which is what the paper values cannot do', () => {
    for (const [field, textToken] of pairs) {
      expect(nightToken(textToken).toLowerCase()).toBe(
        readableOn(token(field), NIGHT_PLATE).toLowerCase(),
      );
    }
    // The premise, stated as a number: the paper variant is unusable here.
    expect(contrastRatio(token('bh-yellow-text'), NIGHT_PAGE)).toBeLessThan(AA_BODY);
  });

  it('keeps the plate distinguishable from the page WITHOUT a shadow', () => {
    // The offset block cannot do this job on a dark ground: see --color-block.
    expect(nightToken('color-card')).not.toBe(nightToken('color-paper'));
    expect(contrastRatio(NIGHT_PLATE, NIGHT_PAGE)).toBeGreaterThan(1.03);
  });

  it('gives the offset block its own colour, neither the ink nor the page', () => {
    const block = nightToken('color-block');
    expect(block).not.toBe(nightToken('color-ink'));
    expect(block).not.toBe(nightToken('color-paper'));
    // Visible against the page, but nowhere near a highlight.
    expect(contrastRatio(block, NIGHT_PAGE)).toBeGreaterThan(1.3);
    expect(contrastRatio(block, NIGHT_PAGE)).toBeLessThan(3);
  });

  it('works for every configured house, as a field and as text', () => {
    for (const house of config.houses) {
      const role = roleFor(house.color, NIGHT_PLATE);
      expect(
        contrastRatio(role.onField, role.field),
        `${house.name}: ink on field`,
      ).toBeGreaterThanOrEqual(AA_BODY);
      expect(
        contrastRatio(role.text, NIGHT_PLATE),
        `${house.name}: text on the plate`,
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});

/**
 * `.label` is 12px, which is small text whatever its letterspacing suggests.
 *
 * It wore `--color-ink-faint`, a token whose own definition says "large text
 * only, never body". Every position label on the review screen, "YOUR NAME" on
 * the check-in desk and "CHECK IN" itself measured 4.49:1 on paper and 3.87:1
 * at night. The token was right; the class using it was wrong.
 */
describe('the small label', () => {
  const globalCss = readFileSync(
    fileURLToPath(new URL('../global.css', import.meta.url)),
    'utf8',
  );
  const rule = globalCss.match(/\.label\s*\{[^}]*\}/)?.[0] ?? '';

  it('uses soft ink rather than the large-text-only faint ink', () => {
    expect(rule, '.label rule not found in global.css').not.toBe('');
    expect(rule).toContain('--color-ink-soft');
    expect(rule).not.toContain('--color-ink-faint');
  });

  it('and soft ink clears AA on every surface of both grounds', () => {
    for (const surface of [PAPER, CARD, SUNK]) {
      expect(contrastRatio(token('color-ink-soft'), surface)).toBeGreaterThanOrEqual(AA_BODY);
    }
    for (const surface of [NIGHT_PAGE, NIGHT_PLATE, NIGHT_SUNK]) {
      expect(contrastRatio(nightToken('color-ink-soft'), surface)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});
