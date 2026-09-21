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
 * Colour is NOT read from the image: a dominant-colour pass over a black shield
 * returns black. Each house's colour is declared in
 * `scripts/build-election-data.mjs`, sampled from its helm. If a crest changes
 * colour, change it there and re-run `npm run data:build`.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const DROP = 'assets/house-logos';
const PUBLIC = 'apps/web/public/houses';
const CONFIG = 'apps/server/config/election.config.json';
const ACCEPTED = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const PLACEHOLDER_SIZE = 240;

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
    copyFileSync(join(DROP, match), join(PUBLIC, `${house.id}${ext}`));
    house.crestUrl = `/houses/${house.id}${ext}`;
    real.push(`${house.name} ← ${match}`);
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
