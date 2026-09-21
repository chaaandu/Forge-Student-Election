import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseElectionConfig,
  parseVoterRoll,
  type ElectionConfig,
  type Voter,
} from '@mesa/election-core';
import { sha256 } from '../lib/crypto.js';

export interface LoadedElection {
  readonly config: ElectionConfig;
  readonly voters: readonly Voter[];
  /** Hash of the configuration file, stamped onto every ballot cast under it. */
  readonly configVersion: string;
}

/**
 * Load and validate the election from disk.
 *
 * Any failure throws, and the caller (main.ts) exits: a half-valid election is
 * worse than no election. The configuration is read once at boot and held in
 * memory, so editing the file mid-election has no effect until a restart — which
 * is deliberate, and which the `config_version` on each ballot makes visible.
 */
export function loadElection(configPath: string, rollPath: string): LoadedElection {
  const configRaw = readFileSync(resolve(configPath), 'utf8');
  const config = parseElectionConfig(JSON.parse(configRaw));
  const rollRaw = readFileSync(resolve(rollPath), 'utf8');
  const voters = parseVoterRoll(JSON.parse(rollRaw), config);

  return { config, voters, configVersion: sha256(configRaw).slice(0, 16) };
}

export class SeedDataInProductionError extends Error {
  override readonly name = 'SeedDataInProductionError';
  constructor() {
    super(
      'This election configuration is marked `isSeedData: true`. It contains demo candidates ' +
        'and demo voters and must never run a real election. Replace config/election.config.json ' +
        'and config/voters.json with the real roll, or unset the flag once you have.',
    );
  }
}

/** Called at boot. The one thing worse than no election is a fake one nobody noticed. */
export function assertNotSeedDataInProduction(
  config: ElectionConfig,
  nodeEnv: string,
): void {
  if (nodeEnv === 'production' && config.election.isSeedData === true) {
    throw new SeedDataInProductionError();
  }
}

/**
 * The election as the browser is allowed to see it.
 *
 * Inactive candidates and the entire voter roll are absent. Nothing here is
 * secret, but nothing here is more than a voter needs either.
 */
export function publicElection(config: ElectionConfig) {
  return {
    election: {
      id: config.election.id,
      name: config.election.name,
      status: config.election.status,
      ...(config.election.opensAt ? { opensAt: config.election.opensAt } : {}),
      ...(config.election.closesAt ? { closesAt: config.election.closesAt } : {}),
      // The banner in the UI keys off this, not off the auth mode. Voting on
      // demo candidates is the genuinely dangerous state; supervised check-in
      // is a deliberate operating choice and needs no alarm.
      isSeedData: config.election.isSeedData === true,
    },
    houses: config.houses,
    positions: config.positions,
    candidates: config.candidates.filter((c) => c.active),
  };
}

export type ElectionWindowState =
  | { open: true }
  | { open: false; reason: 'NOT_STARTED' | 'CLOSED' | 'DRAFT'; at?: string };

/** Whether ballots may be accepted right now. Evaluated server-side on every submission. */
export function electionWindow(config: ElectionConfig, now: Date = new Date()): ElectionWindowState {
  if (config.election.status === 'draft') return { open: false, reason: 'DRAFT' };
  if (config.election.status === 'closed')
    return {
      open: false,
      reason: 'CLOSED',
      ...(config.election.closesAt ? { at: config.election.closesAt } : {}),
    };

  if (config.election.opensAt && now < new Date(config.election.opensAt))
    return { open: false, reason: 'NOT_STARTED', at: config.election.opensAt };
  if (config.election.closesAt && now > new Date(config.election.closesAt))
    return { open: false, reason: 'CLOSED', at: config.election.closesAt };

  return { open: true };
}
