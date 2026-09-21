#!/usr/bin/env node
/**
 * Import the real house crests, or draw placeholders for any that are missing.
 *
 * Drop one PNG per house into `assets/house-logos/`, named by house id:
 *
 *     assets/house-logos/samurai.png      blue kabuto
 *     assets/house-logos/knights.png      red great helm
 *     assets/house-logos/gladiators.png   green spartan helm
 *     assets/house-logos/vikings.png      gold horned helm
 *
 * Then run `npm run houses:import`. PNG is the expected format — transparent
 * background, so the crest sits on both the light plates and the dark welcome
 * screen. JPG, WebP and SVG are accepted too.
 *
 * Any house without a file gets a drawn PNG placeholder in the same shape and
 * proportions, so a partial set is fine and the interface never shows a gap.
 *
 * Colour IS read from the image, by `scripts/sample-crest-colour.py`. A naive
 * dominant-colour pass over a black shield returns black, so that script
 * ignores the field and the background and reads the helm. This matters: the
 * house colours were once all four rotated — Samurai red, Knights blue —
 * invented before anyone had seen the artwork. Reading them from the artwork
 * removes the chance to guess. Houses still on a placeholder keep the colour
 * declared in `scripts/build-election-data.mjs`.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';

const DROP = 'assets/house-logos';
const PUBLIC = 'apps/web/public/houses';
const CONFIG = 'apps/server/config/election.config.json';
const ACCEPTED = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const PLACEHOLDER_SIZE = 240;
/**
 * Crests render between 20 and 64 px. 300 px covers that at 2x on a retina
 * kiosk with room to spare, and a 32-colour palette on flat artwork is
 * visually lossless — together they take a 212 KB shield to about 11 KB.
 */
const DISPLAY_WIDTH = 300;
const PALETTE = 32;

mkdirSync(PUBLIC, { recursive: true });

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const available = existsSync(DROP) ? readdirSync(DROP) : [];

const real = [];
const drawn = [];

for (const house of config.houses) {
  const match = available.find(
    (file) =>
      file.toLowerCase().startsWith(`${house.id}.`) && ACCEPTED.includes(extname(file).toLowerCase()),
  );

  if (match) {
    const ext = extname(match).toLowerCase();
    const source = join(DROP, match);
    const outExt = ext === '.svg' ? '.svg' : '.png';
    const dest = join(PUBLIC, `${house.id}${outExt}`);

    if (ext === '.svg') {
      copyFileSync(source, dest);
    } else {
      // Resize and palette-reduce. The originals stay untouched in assets/.
      execFileSync('python3', [
        'scripts/optimise-crest.py',
        source,
        dest,
        String(DISPLAY_WIDTH),
        String(PALETTE),
      ]);
    }
    house.crestUrl = `/houses/${house.id}${outExt}`;

    // The artwork is the source of truth for colour.
    let sampled = '';
    if (ext !== '.svg') {
      try {
        sampled = execFileSync('python3', ['scripts/sample-crest-colour.py', source])
          .toString()
          .trim();
      } catch {
        sampled = '';
      }
    }
    const before = house.color;
    if (/^#[0-9A-Fa-f]{6}$/.test(sampled)) house.color = sampled;

    const from = statSync(source).size;
    const to = statSync(dest).size;
    real.push(
      `${house.name.padEnd(12)} ${match.padEnd(18)} ${house.color}` +
        `  ${Math.round(from / 1024)}KB → ${Math.round(to / 1024)}KB` +
        (sampled && sampled.toLowerCase() !== before.toLowerCase() ? `  (was ${before})` : ''),
    );
    continue;
  }

  // No artwork yet: draw a shield in the house's colour and elementary form.
  execFileSync('python3', [
    'scripts/generate-crest-placeholder.py',
    join(PUBLIC, `${house.id}.png`),
    house.color,
    house.shape ?? 'square',
    String(PLACEHOLDER_SIZE),
  ]);
  house.crestUrl = `/houses/${house.id}.png`;
  drawn.push(house.name);
}

writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);

if (real.length > 0) {
  console.log('Real crests:');
  for (const line of real) console.log(`  ✓ ${line}`);
}
if (drawn.length > 0) {
  console.log(`Placeholders drawn: ${drawn.join(', ')}`);
  console.log(`  Drop ${drawn.map((n) => `${DROP}/${n.toLowerCase()}.png`).join(', ')} and re-run.`);
}
console.log('\nRemember to rebuild the ballot artwork: npm run paper:build');
