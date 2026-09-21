import { z } from 'zod';
import {
  ELECTION_STATUSES,
  HOUSE_SHAPES,
  POSITION_KINDS,
  VOTER_TYPES,
  ZERO_TURNOUT_POLICIES,
  type ElectionConfig,
  type Voter,
  type VoterType,
} from './types.js';
import { ConfigValidationError, type ValidationIssue } from './errors.js';

/** Weights must sum to 1. Floating point means we compare against a tolerance. */
export const WEIGHT_SUM_TOLERANCE = 1e-9;

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'must be a slug: letters, digits, dot, underscore, hyphen');

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour like #E4572E');

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO-8601 date-time');

/**
 * Photo URLs come from a spreadsheet maintained by humans, so they are treated
 * as hostile input: root-relative paths or https only. This is what stops a
 * `javascript:` URL reaching an <img src> and a http URL causing mixed content.
 */
const photoUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (v) => v.startsWith('/') || v.startsWith('https://'),
    'must be a root-relative path ("/candidates/x.jpg") or an https URL',
  );

const voterTypeSchema = z.enum(VOTER_TYPES);

const weightsSchema = z
  .object(Object.fromEntries(VOTER_TYPES.map((t) => [t, z.number().min(0).max(1)])) as Record<
    VoterType,
    z.ZodNumber
  >)
  .refine(
    (w) => Math.abs(VOTER_TYPES.reduce((s, t) => s + w[t], 0) - 1) <= WEIGHT_SUM_TOLERANCE,
    {
      message: `weights must sum to exactly 1 (got a different total). ` +
        `Student 0.75 + employee 0.25 is the configured Mesa rule.`,
    },
  );

const electionMetaSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  status: z.enum(ELECTION_STATUSES),
  opensAt: isoDateTime.optional(),
  closesAt: isoDateTime.optional(),
  weights: weightsSchema,
  zeroTurnoutPolicy: z.enum(ZERO_TURNOUT_POLICIES).default('renormalise'),
  isSeedData: z.boolean().optional(),
});

const houseSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  color: hexColor,
  shape: z.enum(HOUSE_SHAPES).optional(),
  crestUrl: photoUrl.optional(),
  motto: z.string().max(200).optional(),
});

const eligibilitySchema = z.object({
  voterTypes: z
    .array(voterTypeSchema)
    .min(1, 'a position must be votable by at least one voter type')
    .refine((v) => new Set(v).size === v.length, 'voterTypes must not repeat'),
  houseId: id.optional(),
});

const positionSchema = z.object({
  id,
  title: z.string().min(1).max(120),
  shortTitle: z.string().min(1).max(60).optional(),
  order: z.number().int().min(0),
  kind: z.enum(POSITION_KINDS),
  houseId: id.optional(),
  eligibility: eligibilitySchema,
});

const candidateSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  positionId: id,
  tagline: z.string().max(160).optional(),
  photoUrl: photoUrl.optional(),
  active: z.boolean().default(true),
});

const rawConfigSchema = z.object({
  election: electionMetaSchema,
  houses: z.array(houseSchema),
  positions: z.array(positionSchema).min(1, 'an election needs at least one position'),
  candidates: z.array(candidateSchema).min(1, 'an election needs at least one candidate'),
});

export const voterSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  type: voterTypeSchema,
  houseId: id.optional(),
});

function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({
    path: i.path.length > 0 ? i.path.join('.') : '(root)',
    message: i.message,
  }));
}

function duplicates<T>(items: readonly T[], key: (t: T) => string): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  return [...dupes];
}

/**
 * Cross-entity rules that a per-field schema cannot express.
 *
 * Each one exists because breaking it produces a *silently* wrong election
 * rather than a crash: an orphan candidate nobody can vote for, a gate with no
 * candidates that blocks every voter, a student whose house has no captain
 * contest. The server refuses to boot on any of them.
 */
function crossValidate(config: ElectionConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  for (const dupe of duplicates(config.houses, (h) => h.id))
    push('houses', `duplicate house id "${dupe}"`);
  for (const dupe of duplicates(config.positions, (p) => p.id))
    push('positions', `duplicate position id "${dupe}"`);
  for (const dupe of duplicates(config.candidates, (c) => c.id))
    push('candidates', `duplicate candidate id "${dupe}"`);
  for (const dupe of duplicates(config.positions, (p) => String(p.order)))
    push('positions', `duplicate order ${dupe}: the gate sequence would be non-deterministic`);

  const houseIds = new Set(config.houses.map((h) => h.id));
  const positionIds = new Set(config.positions.map((p) => p.id));

  for (const position of config.positions) {
    const at = `positions.${position.id}`;

    if (position.houseId !== undefined && !houseIds.has(position.houseId))
      push(at, `houseId "${position.houseId}" is not a declared house`);

    if (position.eligibility.houseId !== undefined && !houseIds.has(position.eligibility.houseId))
      push(at, `eligibility.houseId "${position.eligibility.houseId}" is not a declared house`);

    if (position.kind === 'house-captain') {
      if (position.houseId === undefined) push(at, 'house-captain positions must set houseId');
      if (position.eligibility.houseId === undefined)
        push(
          at,
          'house-captain positions must set eligibility.houseId, otherwise every student in ' +
            'every house would vote in this contest',
        );
      else if (position.houseId !== undefined && position.eligibility.houseId !== position.houseId)
        push(at, 'houseId and eligibility.houseId disagree');
    }

    const active = config.candidates.filter((c) => c.positionId === position.id && c.active);
    if (active.length === 0)
      push(at, 'has no active candidates: every eligible voter would be unable to proceed');

    // A position whose eligible groups all carry zero weight cannot be scored.
    const weightSum = position.eligibility.voterTypes.reduce(
      (sum, t) => sum + config.election.weights[t],
      0,
    );
    if (weightSum <= 0)
      push(
        at,
        `eligible voter types [${position.eligibility.voterTypes.join(', ')}] have a combined ` +
          `weight of 0, so this position could never be scored`,
      );
  }

  for (const candidate of config.candidates) {
    if (!positionIds.has(candidate.positionId))
      push(
        `candidates.${candidate.id}`,
        `positionId "${candidate.positionId}" is not a declared position`,
      );
  }

  return issues;
}

/**
 * Parse and fully validate an election configuration.
 *
 * @throws ConfigValidationError listing every problem found, not just the first.
 */
export function parseElectionConfig(input: unknown): ElectionConfig {
  const parsed = rawConfigSchema.safeParse(input);
  if (!parsed.success) throw new ConfigValidationError(zodIssues(parsed.error));

  const config = parsed.data as ElectionConfig;
  const issues = crossValidate(config);
  if (issues.length > 0) throw new ConfigValidationError(issues);

  return config;
}

/**
 * Parse and validate a voter roll against a configuration.
 *
 * Separate from the election config because the roll is PII, is loaded from a
 * different source (Excel or a file), and is never sent to the browser whole.
 */
export function parseVoterRoll(input: unknown, config: ElectionConfig): Voter[] {
  const parsed = z.array(voterSchema).safeParse(input);
  if (!parsed.success) throw new ConfigValidationError(zodIssues(parsed.error));

  const voters = parsed.data as Voter[];
  const issues: ValidationIssue[] = [];
  const houseIds = new Set(config.houses.map((h) => h.id));

  for (const dupe of duplicates(voters, (v) => v.id))
    issues.push({ path: 'voters', message: `duplicate voter id "${dupe}"` });
  for (const dupe of duplicates(voters, (v) => v.email.trim().toLowerCase()))
    issues.push({
      path: 'voters',
      message: `duplicate email "${dupe}" — email is the identity join key and must be unique`,
    });

  const hasHouseContests = config.positions.some((p) => p.eligibility.houseId !== undefined);

  for (const voter of voters) {
    const at = `voters.${voter.id}`;

    if (voter.houseId !== undefined && !houseIds.has(voter.houseId))
      issues.push({ path: at, message: `houseId "${voter.houseId}" is not a declared house` });

    if (voter.type === 'student' && hasHouseContests && voter.houseId === undefined)
      issues.push({
        path: at,
        message:
          'student has no house, so they would silently lose their house captain vote. ' +
          'Assign a house, or remove the house captain positions.',
      });

    const eligibleFor = config.positions.filter(
      (p) =>
        p.eligibility.voterTypes.includes(voter.type) &&
        (p.eligibility.houseId === undefined || p.eligibility.houseId === voter.houseId),
    );
    if (eligibleFor.length === 0)
      issues.push({
        path: at,
        message: 'is eligible for no positions at all — check their type and house',
      });
  }

  if (issues.length > 0) throw new ConfigValidationError(issues);
  return voters;
}

export const schemas = {
  election: electionMetaSchema,
  house: houseSchema,
  position: positionSchema,
  candidate: candidateSchema,
  voter: voterSchema,
  config: rawConfigSchema,
};
