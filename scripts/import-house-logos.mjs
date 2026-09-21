#!/usr/bin/env node
/**
 * Import the real house crests.
 *
 * Drop one image per house into `assets/house-logos/`, named by house id:
 *
 *     assets/house-logos/samurai.png
 *     assets/house-logos/knights.png
 *     assets/house-logos/gladiators.png
 *     assets/house-logos/vikings.png
 *
 * PNG, JPG, WebP or SVG. Then run `npm run houses:import`. The files are copied
 * into `apps/web/public/houses/` and `election.config.json` is updated to point
 * at them; anything missing keeps its drawn placeholder, so a partial set is
 * fine and the interface never breaks.
 *
 * Colour is NOT read from the image. It is declared in
 * `scripts/build-election-data.mjs`, sampled from the crest by eye, because a
 * dominant-colour algorithm on a black shield returns black. If a crest changes
 * colour, change it there and re-run `npm run data:build`.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const DROP = 'assets/house-logos';
const PUBLIC = 'apps/web/public/houses';
const CONFIG = 'apps/server/config/election.config.json';
const ALLOWED = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const available = existsSync(DROP) ? readdirSync(DROP) : [];

let imported = 0;
const missing = [];

for (const house of config.houses) {
  const match = available.find(
    (file) => file.toLowerCase().startsWith(`${house.id}.`) && ALLOWED.includes(extname(file).toLowerCase()),
  );

  if (!match) {
    missing.push(house.id);
    continue;
  }

  const ext = extname(match).toLowerCase();
  copyFileSync(join(DROP, match), join(PUBLIC, `${house.id}${ext}`));
  house.crestUrl = `/houses/${house.id}${ext}`;
  imported += 1;
  console.log(`  ✓ ${house.name.padEnd(12)} ${match}  →  ${house.crestUrl}`);
}

writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);

console.log(`\n${imported} of ${config.houses.length} crests imported.`);
if (missing.length > 0) {
  console.log(
    `  Still using drawn placeholders: ${missing.join(', ')}\n` +
      `  Drop ${missing.map((id) => `${DROP}/${id}.png`).join(', ')} and re-run.`,
  );
}
