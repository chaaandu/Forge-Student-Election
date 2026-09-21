#!/usr/bin/env node
/**
 * Import candidate photographs.
 *
 * Drop the photos into `assets/candidate-photos/` and run:
 *
 *     npm run photos:import
 *
 * Name each file after the candidate — `Sairaj G.jpg`, `sairaj-g.png`,
 * `Preet Jain.jpeg` all work, and so does the candidate id. Matching ignores
 * case, punctuation and spacing, so you do not have to be careful about it.
 *
 * Every photo is cover-cropped to one size and compressed, so a 4 MB phone
 * picture becomes about 50 KB and every card looks the same. Originals are
 * left untouched.
 *
 * Anyone without a photo keeps their initials placeholder — a partial set is
 * fine, and you can re-run this as more arrive.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DROP = 'assets/candidate-photos';
/**
 * Imported photographs land in the web app's asset graph, NOT in `public/`
 * and NOT in `election.config.json`.
 *
 * The config is hashed into `configVersion`, which is stamped onto every
 * ballot to record the ballot definition a vote was cast under. Writing photo
 * paths there would change that hash whenever a headshot arrived, and the
 * audit trail could no longer tell "someone sent a photo" apart from "the
 * slate changed". Photographs are presentation; the config stays put, and
 * `apps/web/src/lib/candidatePhoto.ts` overrides the placeholder at render
 * time. See that file for the rest of the reasoning.
 */
const OUT = 'apps/web/src/assets/candidates';
const CONFIG = 'apps/server/config/election.config.json';
const ACCEPTED = ['.jpg', '.jpeg', '.png', '.webp'];

mkdirSync(OUT, { recursive: true });
mkdirSync(DROP, { recursive: true });

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const files = readdirSync(DROP).filter((f) => ACCEPTED.includes(extname(f).toLowerCase()));

/** Collapse a name or filename to something comparable. */
const key = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const byKey = new Map();
for (const file of files) {
  byKey.set(key(file.replace(extname(file), '')), file);
}

const matched = [];
const missing = [];
const unused = new Set(files);

for (const candidate of config.candidates) {
  // Try the candidate id first, then their name, then the name with the
  // position prefix a batch export often adds.
  const file =
    byKey.get(key(candidate.id)) ??
    byKey.get(key(candidate.name)) ??
    byKey.get(key(`${candidate.positionId} ${candidate.name}`));

  if (!file) {
    missing.push(candidate.name);
    continue;
  }
  unused.delete(file);

  const source = join(DROP, file);
  const dest = join(OUT, `${candidate.id}.jpg`);
  execFileSync('python3', ['scripts/optimise-photo.py', source, dest]);

  matched.push({
    name: candidate.name,
    file,
    from: statSync(source).size,
    to: statSync(dest).size,
  });
}

// Anyone whose photo has been withdrawn goes back to their placeholder,
// so re-running after deleting a file restores the previous state exactly
// rather than leaving an orphan behind.
for (const stale of readdirSync(OUT).filter((f) => f.endsWith('.jpg'))) {
  const id = stale.slice(0, -'.jpg'.length);
  if (!config.candidates.some((c) => c.id === id && !missing.includes(c.name))) {
    rmSync(join(OUT, stale));
    console.log(`  - removed ${stale} (no source photo any more)`);
  }
}

if (matched.length > 0) {
  console.log(`\nImported ${matched.length} of ${config.candidates.length}:\n`);
  for (const m of matched) {
    console.log(
      `  ✓ ${m.name.padEnd(22)} ${m.file.padEnd(28)} ` +
        `${Math.round(m.from / 1024)}KB → ${Math.round(m.to / 1024)}KB`,
    );
  }
}

if (missing.length > 0) {
  console.log(`\nStill on initials (${missing.length}):`);
  for (const name of missing) console.log(`  · ${name}`);
  console.log(`\n  Name each file after the candidate, e.g. "${missing[0]}.jpg", and re-run.`);
}

if (unused.size > 0) {
  console.log(`\nNot matched to anyone — check the spelling:`);
  for (const file of unused) console.log(`  ? ${file}`);
}

console.log(
  missing.length === 0
    ? '\n✓ Every candidate has a photo.\n'
    : `\n${config.candidates.length - missing.length} of ${config.candidates.length} done.\n`,
);
