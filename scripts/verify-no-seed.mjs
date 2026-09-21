#!/usr/bin/env node
/**
 * Pre-election check: refuse to ship demo candidates and demo voters.
 *
 * Run this as part of the go-live checklist (docs/security-model.md §10). The
 * server enforces the same rule at boot; this exists so the answer is known
 * before anyone is standing at a kiosk.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = process.env.ELECTION_CONFIG_PATH ?? 'apps/server/config/election.config.json';
const rollPath = process.env.VOTER_ROLL_PATH ?? 'apps/server/config/voters.json';

const config = JSON.parse(readFileSync(resolve(configPath), 'utf8'));
const roll = JSON.parse(readFileSync(resolve(rollPath), 'utf8'));

const problems = [];

if (config.election?.isSeedData === true) {
  problems.push(
    `${configPath} is marked "isSeedData": true — these are demo candidates, not the real election.`,
  );
}

const seedEmails = roll.filter((voter) => /@seed\.invalid$/i.test(voter.email ?? ''));
if (seedEmails.length > 0) {
  problems.push(
    `${rollPath} contains ${seedEmails.length} voter(s) with @seed.invalid addresses (demo data).`,
  );
}

if (problems.length > 0) {
  console.error('\n✗ This is development data and must not run a real election:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\n  Replace both files with the real configuration and voter roll.\n');
  process.exit(1);
}

console.log(
  `✓ Production data check passed: "${config.election.name}" with ${roll.length} voters.`,
);
