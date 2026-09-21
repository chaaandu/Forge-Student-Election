import { eligiblePositions, isEligible } from './eligibility.js';
import type { BallotSelections, Candidate, ElectionConfig, Position, Voter } from './types.js';

export const BALLOT_ISSUE_CODES = [
  'MISSING_SELECTION',
  'INELIGIBLE_POSITION',
  'UNKNOWN_POSITION',
  'UNKNOWN_CANDIDATE',
  'INACTIVE_CANDIDATE',
  'CANDIDATE_POSITION_MISMATCH',
  'DUPLICATE_SELECTION',
  'MALFORMED_SELECTIONS',
] as const;
export type BallotIssueCode = (typeof BALLOT_ISSUE_CODES)[number];

export interface BallotIssue {
  readonly code: BallotIssueCode;
  readonly positionId?: string;
  readonly candidateId?: string;
  /** Plain language, safe to show a voter. Never contains other voters' data. */
  readonly message: string;
}

export interface BallotValidationResult {
  readonly valid: boolean;
  readonly issues: readonly BallotIssue[];
  /** Eligible positions with no selection — drives "1 gate left" messaging. */
  readonly missingPositionIds: readonly string[];
}

/** Keys that must never be treated as data. Guards against prototype pollution. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function ownEntries(selections: BallotSelections): [string, string][] {
  const out: [string, string][] = [];
  for (const key of Object.keys(selections)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const value = selections[key];
    if (typeof value === 'string' && value.length > 0) out.push([key, value]);
  }
  return out;
}

/**
 * Validate a ballot against the voter's actual eligibility.
 *
 * Runs in the browser for instant feedback and on the server as the authority.
 * The server always calls it with the voter record *it* loaded from the
 * database — never with anything from the request body.
 *
 * A ballot is valid iff the set of selected positions is *exactly* the set the
 * voter is eligible for, and every selection names an active candidate
 * registered for that position.
 *
 * Extra selections are fatal, never trimmed: a payload containing positions the
 * voter may not vote in is either a client bug or manipulation, and silently
 * accepting the remainder would record a vote the voter may not have intended
 * while hiding the fault. See docs/voting-logic.md §4.1.
 */
export function validateBallot(
  config: ElectionConfig,
  voter: Voter,
  selections: BallotSelections,
): BallotValidationResult {
  const issues: BallotIssue[] = [];

  if (selections === null || typeof selections !== 'object' || Array.isArray(selections)) {
    return {
      valid: false,
      issues: [
        {
          code: 'MALFORMED_SELECTIONS',
          message: 'Your ballot could not be read. Please start again.',
        },
      ],
      missingPositionIds: [],
    };
  }

  const positionsById = new Map<string, Position>(config.positions.map((p) => [p.id, p]));
  const candidatesById = new Map<string, Candidate>(config.candidates.map((c) => [c.id, c]));
  const eligible = eligiblePositions(config, voter);
  const eligibleIds = new Set(eligible.map((p) => p.id));

  const entries = ownEntries(selections);
  const seenCandidates = new Map<string, string>();

  for (const [positionId, candidateId] of entries) {
    const position = positionsById.get(positionId);

    if (!position) {
      issues.push({
        code: 'UNKNOWN_POSITION',
        positionId,
        message: `"${positionId}" is not a position in this election.`,
      });
      continue;
    }

    if (!eligibleIds.has(positionId)) {
      // The message deliberately explains *why*, because the honest cause is
      // almost always a stale client, not an attack.
      issues.push({
        code: 'INELIGIBLE_POSITION',
        positionId,
        message: isEligible(voter, position)
          ? `You are not eligible to vote in "${position.title}".`
          : `"${position.title}" is not part of your ballot.`,
      });
      continue;
    }

    const candidate = candidatesById.get(candidateId);
    if (!candidate) {
      issues.push({
        code: 'UNKNOWN_CANDIDATE',
        positionId,
        candidateId,
        message: `The candidate selected for "${position.title}" no longer exists.`,
      });
      continue;
    }

    if (candidate.positionId !== positionId) {
      issues.push({
        code: 'CANDIDATE_POSITION_MISMATCH',
        positionId,
        candidateId,
        message: `${candidate.name} is not standing for "${position.title}".`,
      });
      continue;
    }

    if (!candidate.active) {
      issues.push({
        code: 'INACTIVE_CANDIDATE',
        positionId,
        candidateId,
        message: `${candidate.name} has withdrawn from "${position.title}". Please choose again.`,
      });
      continue;
    }

    const alreadyUsedFor = seenCandidates.get(candidateId);
    if (alreadyUsedFor !== undefined) {
      issues.push({
        code: 'DUPLICATE_SELECTION',
        positionId,
        candidateId,
        message: `${candidate.name} is selected for more than one position.`,
      });
      continue;
    }
    seenCandidates.set(candidateId, positionId);
  }

  const provided = new Set(entries.map(([positionId]) => positionId));
  const missingPositionIds: string[] = [];

  for (const position of eligible) {
    if (!provided.has(position.id)) {
      missingPositionIds.push(position.id);
      issues.push({
        code: 'MISSING_SELECTION',
        positionId: position.id,
        message: `No selection made for "${position.title}".`,
      });
    }
  }

  return { valid: issues.length === 0, issues, missingPositionIds };
}
