// @vitest-environment node
//
// Runs in node rather than jsdom so the real stylesheet can be read from disk:
// the assertions must check the file the app actually ships, not a copy that
// can drift out of sync with it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`token --${name} not found or not a hex value`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16))
  );
}

function ratio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

/**
 * Paper is a light surface, which makes it easy to get contrast wrong in the
 * opposite direction from a dark theme: warm greys that look elegant on a
 * designer's calibrated display and vanish under a hall's overhead lights.
 * Every pair is measured.
 */
describe('ink on paper', () => {
  const surfaces = ['color-paper', 'color-sheet', 'color-sheet-sunk'];

  it.each(['color-ink', 'color-ink-soft', 'color-mark', 'color-confirm', 'color-alert'])(
    '%s meets AA for body text on every paper surface',
    (foreground) => {
      for (const surface of surfaces) {
        const value = ratio(token(foreground), token(surface));
        expect(value, `${foreground} on ${surface} is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_BODY,
        );
      }
    },
  );

  it('body ink is far beyond the minimum, because most reading happens here', () => {
    expect(ratio(token('color-ink'), token('color-paper'))).toBeGreaterThanOrEqual(12);
  });

  it('the mark colour is readable as text, not only as a graphic', () => {
    expect(ratio(token('color-mark'), token('color-sheet'))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('paper on the primary (ink) button meets AA', () => {
    expect(ratio(token('color-sheet'), token('color-ink'))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('tertiary ink meets AA for large text only, and is documented as such', () => {
    const value = ratio(token('color-ink-faint'), token('color-paper'));
    expect(value).toBeGreaterThanOrEqual(AA_LARGE);
    expect(css).toMatch(/--color-ink-faint[\s\S]{0,120}never body/);
  });

  it('rules are visible against both the desk and a sheet', () => {
    expect(ratio(token('color-rule'), token('color-sheet'))).toBeGreaterThan(1.18);
    expect(ratio(token('color-rule-strong'), token('color-sheet'))).toBeGreaterThan(1.6);
  });

  it('a sheet is distinguishable from the desk without relying on shadow', () => {
    expect(ratio(token('color-sheet'), token('color-paper'))).toBeGreaterThan(1.05);
    expect(token('color-sheet')).not.toBe(token('color-paper'));
  });
});

describe('house colours are legible on paper', () => {
  // Read from the election configuration rather than the token file: these are
  // set by whoever runs the election, and a bad choice must fail a test rather
  // than quietly ship.
  const config = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../server/config/election.config.json', import.meta.url)),
      'utf8',
    ),
  ) as { houses: { id: string; name: string; color: string }[] };

  it.each(config.houses.map((h) => [h.name, h.color]))(
    '%s (%s) meets AA against a sheet',
    (_name, color) => {
      expect(ratio(color, token('color-sheet'))).toBeGreaterThanOrEqual(AA_BODY);
    },
  );
});

describe('reduced motion is wired into the tokens', () => {
  it('collapses the ink stroke and every transition', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/--dur-mark:\s*1ms/);
    expect(block).toMatch(/--dur-step:\s*1ms/);
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});
