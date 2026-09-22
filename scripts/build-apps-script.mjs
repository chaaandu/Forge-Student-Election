#!/usr/bin/env node
/**
 * Generate the Apps Script config from the repository's election data.
 *
 * The election is defined once, in `apps/server/config/election.config.json`
 * and `voters.json`. This emits it as a `Config.gs` for the Apps Script
 * deployment, so the hosted ballot and the repository cannot drift into
 * disagreeing about who is standing — which is exactly what would happen if the
 * candidate list were maintained by hand in two places.
 *
 *   npm run appsscript:build
 *
 * Then paste the four files in apps-script/ into the Apps Script editor, or
 * push them with clasp. Re-run and re-paste Config.gs whenever the election
 * data changes.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('apps/server/config/election.config.json', ROOT));
const ROLL_PATH = fileURLToPath(new URL('apps/server/config/voters.json', ROOT));
const OUT_PATH = fileURLToPath(new URL('apps-script/Config.gs', ROOT));

if (!existsSync(CONFIG_PATH)) {
  console.error(`\n  No election config at ${CONFIG_PATH}\n`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

/*
  The roll is git-ignored because it is 145 real names and school addresses, so
  a fresh clone has none. Emitting an empty roll rather than failing lets the
  rest be generated and reviewed; `setup()` then leaves the Roll tab alone,
  which is the right behaviour when the sheet already holds the real one.
*/
const roll = existsSync(ROLL_PATH) ? JSON.parse(readFileSync(ROLL_PATH, 'utf8')) : [];

if (config.election.isSeedData) {
  console.error('\n  Refusing to build: this config is marked isSeedData.\n');
  process.exit(1);
}

const payload = {
  election: {
    id: config.election.id,
    name: config.election.name,
    status: config.election.status,
    weights: config.election.weights,
    zeroTurnoutPolicy: config.election.zeroTurnoutPolicy ?? 'renormalise',
  },
  houses: config.houses.map((h) => ({ id: h.id, name: h.name, color: h.color, shape: h.shape })),
  positions: config.positions.map((p) => ({
    id: p.id,
    title: p.title,
    shortTitle: p.shortTitle,
    order: p.order,
    kind: p.kind,
    ...(p.houseId ? { houseId: p.houseId } : {}),
    eligibility: p.eligibility,
  })),
  candidates: config.candidates.map((c) => ({
    id: c.id,
    name: c.name,
    positionId: c.positionId,
    ...(c.tagline ? { tagline: c.tagline } : {}),
    ...(c.photoUrl ? { photoUrl: c.photoUrl } : {}),
    active: c.active !== false,
  })),
  roll: roll.map((v) => ({
    id: v.id,
    name: v.name,
    email: v.email,
    type: v.type,
    houseId: v.houseId ?? null,
  })),
};

const banner = `/**
 * GENERATED — do not edit.
 *
 * Built by \`npm run appsscript:build\` from apps/server/config/election.config.json
 * and voters.json. Hand-editing this makes the hosted ballot disagree with the
 * repository about who is standing, and the repository is the source of truth.
 *
 * Generated ${new Date().toISOString()}
 * ${payload.positions.length} contests · ${payload.candidates.length} candidates · ${payload.roll.length} on the roll
 */

var CONFIG = ${JSON.stringify(payload, null, 2)};
`;

writeFileSync(OUT_PATH, banner, 'utf8');

console.log(`\n  Wrote apps-script/Config.gs`);
console.log(`    ${payload.positions.length} contests`);
console.log(`    ${payload.candidates.length} candidates`);
console.log(
  `    ${payload.roll.length} on the roll` + (payload.roll.length === 0 ? '  (voters.json absent)' : ''),
);
console.log(`    weights ${JSON.stringify(payload.election.weights)}\n`);
