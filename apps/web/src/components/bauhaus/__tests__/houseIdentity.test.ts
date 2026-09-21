// @vitest-environment node
//
// Reads the live election configuration from disk, so these assertions check
// what the app actually ships rather than a fixture that can drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { House } from '@mesa/election-core';
import { AA_BODY, contrastRatio, inkOn, roleFor } from '../../../lib/color';

const config = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../../server/config/election.config.json', import.meta.url)),
    'utf8',
  ),
) as { houses: House[] };

/**
 * The crests are the source of truth for house colour. An earlier configuration
 * had all four rotated — Samurai red, Knights blue — which only the artwork
 * revealed. These assertions pin the mapping so it cannot drift back.
 */
describe('house identity matches the crests', () => {
  const expected: Record<string, { hue: string; shape: string }> = {
    samurai: { hue: 'blue', shape: 'circle' },
    knights: { hue: 'red', shape: 'square' },
    gladiators: { hue: 'green', shape: 'arc' },
    vikings: { hue: 'gold', shape: 'triangle' },
  };

  const dominant = (hex: string): string => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    if (b > r && b > g) return 'blue';
    if (r > g * 1.5 && r > b) return 'red';
    if (g > b && r > b && Math.abs(r - g) < 90 && r > 180) return 'gold';
    if (g > r && g > b) return 'green';
    return 'other';
  };

  it.each(Object.entries(expected))('%s is the right colour and form', (id, want) => {
    const house = config.houses.find((h) => h.id === id)!;
    expect(dominant(house.color), `${id} is ${house.color}`).toBe(want.hue);
    expect(house.shape).toBe(want.shape);
  });

  it('follows Kandinsky: red square, blue circle, yellow triangle', () => {
    const byId = Object.fromEntries(config.houses.map((h) => [h.id, h]));
    expect(byId['knights']?.shape).toBe('square');
    expect(byId['samurai']?.shape).toBe('circle');
    expect(byId['vikings']?.shape).toBe('triangle');
  });

  it('keeps every house readable as a field and as text', () => {
    for (const house of config.houses) {
      const role = roleFor(house.color);
      expect(contrastRatio(inkOn(house.color), house.color), house.name).toBeGreaterThanOrEqual(
        AA_BODY,
      );
      expect(contrastRatio(role.text, '#F2EDE1'), house.name).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('gives every house a crest', () => {
    for (const house of config.houses) {
      expect(house.crestUrl, house.name).toMatch(/^\/houses\/[a-z]+\.(svg|png|jpg|jpeg|webp)$/);
    }
  });
});
