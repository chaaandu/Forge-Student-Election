// @vitest-environment node
//
// Runs in node rather than jsdom so the real stylesheet can be read from disk:
// the assertions must check the file the app actually ships, not a copy that
// can drift out of sync with it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8');

/**
 * Contrast is asserted, not assumed.
 *
 * Amber on a dark board is exactly the combination that looks fine to a
 * designer and fails for a voter in a bright hall, so every foreground/
 * background pair in the token set is measured here against WCAG 2.2 AA.
 */

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
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe('token contrast on the board', () => {
  const backgrounds = ['color-ink', 'color-board', 'color-surface', 'color-flap'];

  it.each(['color-text', 'color-text-muted', 'color-signal', 'color-go', 'color-stop'])(
    '%s meets AA for body text on every board surface',
    (foreground) => {
      for (const background of backgrounds) {
        const value = ratio(token(foreground), token(background));
        expect(
          value,
          `${foreground} on ${background} is ${value.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_BODY);
      }
    },
  );

  it('amber signal text is comfortably readable on ink', () => {
    expect(ratio(token('color-signal'), token('color-ink'))).toBeGreaterThanOrEqual(7);
  });

  it('text on the amber CTA meets AA', () => {
    expect(ratio(token('color-signal-ink'), token('color-signal'))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('tertiary text meets AA for large text only, and is documented as such', () => {
    const value = ratio(token('color-text-dim'), token('color-ink'));
    expect(value).toBeGreaterThanOrEqual(AA_LARGE);
    expect(css).toMatch(/--color-text-dim[\s\S]{0,120}tertiary/);
  });

  it('the brand accent meets AA for large text', () => {
    expect(ratio(token('color-brand'), token('color-ink'))).toBeGreaterThanOrEqual(AA_LARGE);
    expect(ratio(token('color-brand-soft'), token('color-ink'))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('surfaces are distinguishable from the page without relying on shadow', () => {
    expect(ratio(token('color-surface'), token('color-ink'))).toBeGreaterThan(1.1);
    expect(ratio(token('color-line'), token('color-ink'))).toBeGreaterThan(1.2);
  });
});

describe('reduced motion is wired into the tokens', () => {
  it('collapses every animation duration', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/--dur-flap:\s*0ms/);
    expect(block).toMatch(/--dur-step:\s*1ms/);
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});
