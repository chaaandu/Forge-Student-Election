import { UnknownCandidateError, WeightingError } from './errors.js';
import { VOTER_TYPES, type Candidate, type ElectionConfig, type Position, type Tally, type VoterType } from './types.js';

/** Two scores closer than this are a tie, not an ordering. Float noise must not decide an election. */
export const TIE_TOLERANCE = 1e-9;

export type WeightingBasis =
  /** Several groups eligible, all voted. The configured weights apply. */
  | 'WEIGHTED'
  /** Only one group is eligible for this position. That group carries 100%. */
  | 'SINGLE_GROUP'
  /** A group was eligible but cast no votes; weights renormalised to those that did. */
  | 'RENORMALISED_ZERO_TURNOUT'
  /** A group was eligible and silent; its weight was retained, so scores are capped. */
  | 'ZERO_TURNOUT_RETAINED'
  /** Nobody voted in this position. No division is attempted. */
  | 'NO_VOTES';

export interface TypeBreakdown {
  readonly votes: number;
  /** Votes cast in this position by this group — the denominator, never a hard-coded roll size. */
  readonly totalVotes: number;
  readonly share: number;
  /** The weight actually applied, after eligibility resolution and any renormalisation. */
  readonly weight: number;
  readonly contribution: number;
}

export interface CandidateResult {
  readonly candidateId: string;
  readonly candidateName: string;
  readonly active: boolean;
  /** Present only for voter types eligible for this position. */
  readonly perType: Partial<Record<VoterType, TypeBreakdown>>;
  readonly finalScore: number;
  readonly finalScorePercent: number;
  /** Competition ranking: 1, 1, 3. */
  readonly rank: number;
  readonly tied: boolean;
}

export interface PositionTurnout {
  readonly eligibleVoters: number;
  readonly ballotsCast: number;
  readonly turnoutRate: number;
  readonly byType: Partial<Record<VoterType, { eligible: number; cast: number; rate: number }>>;
}

export interface PositionResult {
  readonly positionId: string;
  readonly positionTitle: string;
  readonly weightingBasis: WeightingBasis;
  /** Human-readable, printed next to every row so nobody misreads which rule applied. */
  readonly weightingLabel: string;
  readonly effectiveWeights: Partial<Record<VoterType, number>>;
  readonly candidates: readonly CandidateResult[];
  /** Null when tied at the top or when no votes were cast. Ties are reported, never broken. */
  readonly winner: { candidateId: string; candidateName: string } | null;
  readonly turnout?: PositionTurnout;
}

export interface ElectionResults {
  readonly electionId: string;
  readonly electionName: string;
  readonly generatedAt: string;
  readonly zeroTurnoutPolicy: string;
  readonly positions: readonly PositionResult[];
  readonly participation: Partial<Record<VoterType, { ballots: number; eligible?: number }>>;
}

export interface CalculateResultsInput {
  readonly config: ElectionConfig;
  readonly tallies: readonly Tally[];
  /** Eligible-voter counts per position, per type. Turnout is omitted when absent, never faked. */
  readonly electorate?: ReadonlyMap<string, Partial<Record<VoterType, number>>>;
  /** Distinct ballots cast per voter type, for the participation summary. */
  readonly ballotsByType?: Partial<Record<VoterType, number>>;
  readonly now?: Date;
}

function formatPercent(value: number): string {
  const pct = value * 100;
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '');
}

function titleCase(type: VoterType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function describeWeighting(
  basis: WeightingBasis,
  effective: Partial<Record<VoterType, number>>,
  silentTypes: readonly VoterType[],
): string {
  const applied = VOTER_TYPES.filter((t) => (effective[t] ?? 0) > 0);

  switch (basis) {
    case 'NO_VOTES':
      return 'No votes cast';
    case 'SINGLE_GROUP': {
      const only = applied[0];
      return only ? `${titleCase(only)}-only (100%)` : 'No eligible voters';
    }
    case 'RENORMALISED_ZERO_TURNOUT': {
      const silent = silentTypes.map(titleCase).join(', ').toLowerCase();
      if (applied.length === 1 && applied[0]) {
        return `${titleCase(applied[0])}-only (100%) — ${silent} eligible but cast no votes`;
      }
      const split = applied.map((t) => formatPercent(effective[t] ?? 0)).join('/');
      return `Weighted ${split} (${applied.join('/')}) — ${silent} eligible but cast no votes`;
    }
    case 'ZERO_TURNOUT_RETAINED': {
      const split = applied.map((t) => formatPercent(effective[t] ?? 0)).join('/');
      const silent = silentTypes.map(titleCase).join(', ').toLowerCase();
      // The ceiling is the weight of the groups that actually voted: a silent
      // group's retained weight is unreachable by every candidate.
      const cap = formatPercent(
        applied
          .filter((t) => !silentTypes.includes(t))
          .reduce((sum, t) => sum + (effective[t] ?? 0), 0),
      );
      return (
        `Weighted ${split} (${applied.join('/')}) — ${silent} cast no votes; ` +
        `weight retained, so the maximum attainable score is ${cap}%`
      );
    }
    case 'WEIGHTED':
    default: {
      const split = applied.map((t) => formatPercent(effective[t] ?? 0)).join('/');
      return `Weighted ${split} (${applied.join('/')})`;
    }
  }
}

/**
 * Resolve the weights that actually apply to one position.
 *
 * Two cases that look identical in the raw numbers are handled differently on
 * purpose (docs/voting-logic.md §6.1):
 *
 *   1. A group is INELIGIBLE (house captains have no employee electorate).
 *      Structural. Renormalise to the eligible groups, always. Applying 75/25
 *      here would cap a candidate holding every student vote at 0.75, which is
 *      simply a wrong number.
 *
 *   2. A group is ELIGIBLE but cast zero votes. A turnout fact, so it is a
 *      governance decision and lives in `election.zeroTurnoutPolicy`.
 */
export function resolveEffectiveWeights(
  config: ElectionConfig,
  position: Position,
  totalsByType: Partial<Record<VoterType, number>>,
): {
  weights: Partial<Record<VoterType, number>>;
  basis: WeightingBasis;
  silentTypes: VoterType[];
} {
  const eligibleTypes = VOTER_TYPES.filter((t) => position.eligibility.voterTypes.includes(t));

  if (eligibleTypes.length === 0) {
    throw new WeightingError(
      `Position "${position.id}" has no eligible voter types. This should have been rejected ` +
        `at configuration load.`,
    );
  }

  // Step 1: restrict the configured weights to the eligible groups and renormalise.
  const eligibleWeightSum = eligibleTypes.reduce((s, t) => s + config.election.weights[t], 0);
  if (eligibleWeightSum <= 0) {
    throw new WeightingError(
      `Position "${position.id}" is votable only by groups whose configured weights sum to 0.`,
    );
  }
  const normalised: Partial<Record<VoterType, number>> = {};
  for (const t of eligibleTypes) normalised[t] = config.election.weights[t] / eligibleWeightSum;

  // Step 2: apply the zero-turnout policy.
  const votedTypes = eligibleTypes.filter((t) => (totalsByType[t] ?? 0) > 0);
  const silentTypes = eligibleTypes.filter((t) => (totalsByType[t] ?? 0) === 0);

  if (votedTypes.length === 0) {
    const zeroed: Partial<Record<VoterType, number>> = {};
    for (const t of eligibleTypes) zeroed[t] = normalised[t] ?? 0;
    return { weights: zeroed, basis: 'NO_VOTES', silentTypes };
  }

  if (silentTypes.length === 0) {
    return {
      weights: normalised,
      basis: eligibleTypes.length === 1 ? 'SINGLE_GROUP' : 'WEIGHTED',
      silentTypes: [],
    };
  }

  if (config.election.zeroTurnoutPolicy === 'treat-as-zero') {
    // Weights retained. Silent groups contribute 0 to every candidate, so the
    // ranking is unchanged but the attainable maximum is compressed.
    return { weights: normalised, basis: 'ZERO_TURNOUT_RETAINED', silentTypes };
  }

  const votedSum = votedTypes.reduce((s, t) => s + (normalised[t] ?? 0), 0);
  const renormalised: Partial<Record<VoterType, number>> = {};
  for (const t of votedTypes) renormalised[t] = (normalised[t] ?? 0) / votedSum;
  return { weights: renormalised, basis: 'RENORMALISED_ZERO_TURNOUT', silentTypes };
}

function rankCandidates(
  scored: { candidateId: string; candidateName: string; active: boolean; finalScore: number; perType: Partial<Record<VoterType, TypeBreakdown>> }[],
): CandidateResult[] {
  const sorted = [...scored].sort((a, b) => {
    const diff = b.finalScore - a.finalScore;
    if (Math.abs(diff) > TIE_TOLERANCE) return diff;
    // Stable, deterministic ordering within a tie. This is presentation only —
    // `tied: true` tells the reader the scores are equal.
    return a.candidateName.localeCompare(b.candidateName);
  });

  const results: CandidateResult[] = [];
  let index = 0;

  while (index < sorted.length) {
    const head = sorted[index];
    if (!head) break;
    let end = index + 1;
    while (end < sorted.length) {
      const next = sorted[end];
      if (!next || Math.abs(next.finalScore - head.finalScore) > TIE_TOLERANCE) break;
      end += 1;
    }
    const rank = index + 1;
    const tied = end - index > 1;
    for (let i = index; i < end; i += 1) {
      const entry = sorted[i];
      if (!entry) continue;
      results.push({
        candidateId: entry.candidateId,
        candidateName: entry.candidateName,
        active: entry.active,
        perType: entry.perType,
        finalScore: entry.finalScore,
        finalScorePercent: Math.round(entry.finalScore * 10000) / 100,
        rank,
        tied,
      });
    }
    index = end;
  }

  return results;
}

/**
 * Calculate weighted results for every position.
 *
 * Pure: no I/O, no clock beyond an injectable `now`, no knowledge of how many
 * students or employees exist. Group sizes are counted from the votes actually
 * cast, so the arithmetic is identical for 118 students or 1,180.
 */
export function calculateResults(input: CalculateResultsInput): ElectionResults {
  const { config, tallies } = input;
  const now = input.now ?? new Date();

  const candidatesById = new Map<string, Candidate>(config.candidates.map((c) => [c.id, c]));

  // Index tallies: position -> candidate -> type -> votes, and position -> type totals.
  const byPosition = new Map<string, Map<string, Partial<Record<VoterType, number>>>>();
  const totals = new Map<string, Partial<Record<VoterType, number>>>();

  for (const tally of tallies) {
    if (tally.votes < 0 || !Number.isFinite(tally.votes)) {
      throw new WeightingError(
        `Tally for candidate "${tally.candidateId}" has a non-finite or negative vote count.`,
      );
    }
    const candidate = candidatesById.get(tally.candidateId);
    if (!candidate) throw new UnknownCandidateError(tally.candidateId, tally.positionId);
    if (candidate.positionId !== tally.positionId) {
      throw new UnknownCandidateError(tally.candidateId, tally.positionId);
    }

    let positionMap = byPosition.get(tally.positionId);
    if (!positionMap) {
      positionMap = new Map();
      byPosition.set(tally.positionId, positionMap);
    }
    const candidateMap = positionMap.get(tally.candidateId) ?? {};
    candidateMap[tally.voterType] = (candidateMap[tally.voterType] ?? 0) + tally.votes;
    positionMap.set(tally.candidateId, candidateMap);

    const positionTotals = totals.get(tally.positionId) ?? {};
    positionTotals[tally.voterType] = (positionTotals[tally.voterType] ?? 0) + tally.votes;
    totals.set(tally.positionId, positionTotals);
  }

  const positions = [...config.positions]
    .sort((a, b) => a.order - b.order)
    .map((position): PositionResult => {
      const positionTotals = totals.get(position.id) ?? {};
      const { weights, basis, silentTypes } = resolveEffectiveWeights(
        config,
        position,
        positionTotals,
      );
      const eligibleTypes = VOTER_TYPES.filter((t) =>
        position.eligibility.voterTypes.includes(t),
      );
      const votesMap = byPosition.get(position.id);

      const scored = config.candidates
        .filter((c) => c.positionId === position.id)
        .map((candidate) => {
          const perCandidate = votesMap?.get(candidate.id) ?? {};
          const perType: Partial<Record<VoterType, TypeBreakdown>> = {};
          let finalScore = 0;

          for (const type of eligibleTypes) {
            const votes = perCandidate[type] ?? 0;
            const totalVotes = positionTotals[type] ?? 0;
            // The zero guard: no division is attempted when a group cast nothing.
            const share = totalVotes === 0 ? 0 : votes / totalVotes;
            const weight = weights[type] ?? 0;
            const contribution = share * weight;
            finalScore += contribution;
            perType[type] = { votes, totalVotes, share, weight, contribution };
          }

          return {
            candidateId: candidate.id,
            candidateName: candidate.name,
            active: candidate.active,
            perType,
            finalScore,
          };
        });

      const ranked = rankCandidates(scored);
      const leaders = ranked.filter((c) => c.rank === 1);
      const winner =
        basis !== 'NO_VOTES' && leaders.length === 1 && leaders[0]
          ? { candidateId: leaders[0].candidateId, candidateName: leaders[0].candidateName }
          : null;

      const electorate = input.electorate?.get(position.id);
      let turnout: PositionTurnout | undefined;
      if (electorate) {
        const byType: PositionTurnout['byType'] = {};
        let eligibleVoters = 0;
        let ballotsCast = 0;
        for (const type of eligibleTypes) {
          const eligible = electorate[type] ?? 0;
          const cast = positionTotals[type] ?? 0;
          eligibleVoters += eligible;
          ballotsCast += cast;
          byType[type] = { eligible, cast, rate: eligible === 0 ? 0 : cast / eligible };
        }
        turnout = {
          eligibleVoters,
          ballotsCast,
          turnoutRate: eligibleVoters === 0 ? 0 : ballotsCast / eligibleVoters,
          byType,
        };
      }

      return {
        positionId: position.id,
        positionTitle: position.title,
        weightingBasis: basis,
        weightingLabel: describeWeighting(basis, weights, silentTypes),
        effectiveWeights: weights,
        candidates: ranked,
        winner,
        ...(turnout ? { turnout } : {}),
      };
    });

  const participation: ElectionResults['participation'] = {};
  for (const type of VOTER_TYPES) {
    const ballots = input.ballotsByType?.[type];
    if (ballots !== undefined) participation[type] = { ballots };
  }

  return {
    electionId: config.election.id,
    electionName: config.election.name,
    generatedAt: now.toISOString(),
    zeroTurnoutPolicy: config.election.zeroTurnoutPolicy,
    positions,
    participation,
  };
}
