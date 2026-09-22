// @vitest-environment node
//
// Reads the live election configuration from disk, so these assertions check
// what the app actually ships rather than a fixture that can drift.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { House } from '@mesa/election-core';
import { AA_BODY, contrastRatio, roleFor } from '../../../lib/color';

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

  it('keeps every house readable as a field and as text, on BOTH grounds', () => {
    // Named grounds, not the default: this asserts a property of the houses,
    // not of whichever theme happens to be shipping this week.
    for (const house of config.houses) {
      const role = roleFor(house.color, '#F2EDE1');
      // The field may be adjusted from the crest colour; what matters is that
      // whatever block ships can carry its ink.
      expect(contrastRatio(role.onField, role.field), `${house.name} ink on field`)
        .toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(role.text, '#F2EDE1'), `${house.name} text on paper`)
        .toBeGreaterThanOrEqual(AA_BODY);

      const night = roleFor(house.color, '#1A1A1E');
      expect(contrastRatio(night.onField, night.field), `${house.name} ink on field at night`)
        .toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(night.text, '#1A1A1E'), `${house.name} text at night`)
        .toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('keeps the crest colour itself untouched for shapes and bars', () => {
    for (const house of config.houses) {
      expect(roleFor(house.color, '#F2EDE1').brand).toBe(house.color);
    }
  });

  it('keeps every crest small enough for a kiosk to load without thinking', () => {
    // The supplied shields are ~200 KB each. They render between 20 and 64 px
    // and are also inlined into the ballot sheet, so `houses:import` resizes
    // and palette-reduces them. This guards against a large file being dropped
    // straight in and quietly bloating the landing screen.
    for (const house of config.houses) {
      const file = fileURLToPath(new URL(`../../../../public${house.crestUrl}`, import.meta.url));
      const kb = statSync(file).size / 1024;
      expect(kb, `${house.name} crest is ${Math.round(kb)} KB`).toBeLessThan(60);
    }
  });

  it('gives every house a crest file that exists on disk', () => {
    for (const house of config.houses) {
      expect(house.crestUrl, house.name).toMatch(/^\/houses\/[a-z]+\.(png|jpg|jpeg|webp|svg)$/);
      const file = fileURLToPath(new URL(`../../../../public${house.crestUrl}`, import.meta.url));
      expect(existsSync(file), `${house.name}: ${house.crestUrl} is missing`).toBe(true);
    }
  });
});
