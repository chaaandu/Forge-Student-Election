#!/usr/bin/env node
/**
 * Bake the election into the web bundle.
 *
 * WHY THIS EXISTS. The ballot used to fetch `action=election` before it could
 * draw anything, and on the Apps Script deployment that is a request through a
 * content layer measured between 0.5s and 30s which drops roughly one reply in
 * three. When it dropped four times the boot spent about three minutes on
 * "Preparing the ballot…" and then told the voter to fetch the person running
 * the election - for data that has not changed since the bundle was built and
 * is sitting in this repository.
 *
 * Houses, positions and candidates are static for the whole election. There is
 * nothing to ask anyone. So they are compiled in, and the ballot opens with no
 * network at all.
 *
 * `status` is the one field that can change during polling, so the running app
 * re-checks it in the background - see `api.electionFresh`. Nothing is trusted
 * from here that decides whether a vote counts: the server re-checks the
 * window, re-reads the voter and re-validates every selection before anything
 * is recorded.
 *
 *   npm run election:bake
 *
 * Runs automatically in `npm run build -w @mesa/web`, which is what Vercel
 * runs, so the deployed bundle cannot carry a stale candidate list.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const SOURCE = fileURLToPath(new URL('apps/server/config/election.config.json', ROOT));
const OUT_DIR = fileURLToPath(new URL('apps/web/src/generated/', ROOT));
const OUT = `${OUT_DIR}election.ts`;

const config = JSON.parse(readFileSync(SOURCE, 'utf8'));

/*
  The same payload `electionPayload_()` builds in apps-script/core.gs, from the
  same file it was generated from. If those two ever disagree the ballot would
  show one set of candidates and the script would accept another, so the shape
  is kept deliberately boring: pass the collections through whole.
*/
const payload = {
  election: {
    id: config.election.id,
    name: config.election.name,
    status: config.election.status,
    ...(config.election.opensAt ? { opensAt: config.election.opensAt } : {}),
    ...(config.election.closesAt ? { closesAt: config.election.closesAt } : {}),
    ...(config.election.isSeedData ? { isSeedData: true } : {}),
  },
  houses: config.houses,
  positions: config.positions,
  candidates: config.candidates,
  window: config.election.status === 'open' ? { open: true } : { open: false, reason: 'CLOSED' },
  // Apps Script only ever runs supervised check-in; this constant is not used
  // on the Express path, which still asks the server.
  auth: { mode: 'supervised', supportsRollSearch: true, requiresSupervision: true },
  configVersion: `baked-${config.election.id}`,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT,
  `/**
 * GENERATED - do not edit.
 *
 * Built by \`npm run election:bake\` from apps/server/config/election.config.json.
 * Edit that file and rebuild; hand-editing this makes the ballot disagree with
 * the repository about who is standing.
 *
 * ${payload.positions.length} contests - ${payload.candidates.length} candidates
 */
import type { PublicElection } from '../lib/api';

export const BAKED_ELECTION: PublicElection = ${JSON.stringify(payload, null, 2)} as PublicElection;
`,
  'utf8',
);

console.log(
  `\n  Baked the election into the bundle` +
    `\n    ${payload.positions.length} contests, ${payload.candidates.length} candidates` +
    `\n    status: ${payload.election.status}\n`,
);
