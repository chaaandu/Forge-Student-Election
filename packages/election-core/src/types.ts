/**
 * Domain types for the Mesa election system.
 *
 * Nothing in this package knows about HTTP, React, or SQLite. Every election
 * rule that matters lives here so it can be tested in isolation and shared
 * verbatim between the browser (for instant feedback) and the server (which is
 * the only authority).
 */

/**
 * The voter groups that exist in the system.
 *
 * Adding a group is a two-step change: add it here, and give it a weight in
 * `election.weights`. Weight renormalisation (see results.ts) already handles
 * an arbitrary number of groups, and eligibility is declared per position, so
 * no branching logic needs to change.
 */
export const VOTER_TYPES = ['student', 'employee'] as const;
export type VoterType = (typeof VOTER_TYPES)[number];

export const ELECTION_STATUSES = ['draft', 'open', 'closed'] as const;
export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

export const POSITION_KINDS = ['leadership', 'house-captain'] as const;
export type PositionKind = (typeof POSITION_KINDS)[number];

/**
 * How to treat a voter group that is eligible for a position but cast no votes
 * at all. See docs/voting-logic.md §6.1 — this is a governance decision, not a
 * technical one, which is why it is configuration.
 */
export const ZERO_TURNOUT_POLICIES = ['renormalise', 'treat-as-zero'] as const;
export type ZeroTurnoutPolicy = (typeof ZERO_TURNOUT_POLICIES)[number];

export interface ElectionMeta {
  readonly id: string;
  readonly name: string;
  readonly status: ElectionStatus;
  /** ISO-8601. When set, the server refuses ballots before this instant. */
  readonly opensAt?: string;
  /** ISO-8601. When set, the server refuses ballots after this instant. */
  readonly closesAt?: string;
  readonly weights: Readonly<Record<VoterType, number>>;
  readonly zeroTurnoutPolicy: ZeroTurnoutPolicy;
  /**
   * Marks development/demo data. The server refuses to start with this set
   * under NODE_ENV=production, and the UI shows a permanent banner, so seed
   * voters and candidates can never quietly become a real election.
   */
  readonly isSeedData?: boolean;
}

export interface House {
  readonly id: string;
  readonly name: string;
  /** Hex colour used for that house's concourse. Presentation reads this; logic never does. */
  readonly color: string;
  readonly motto?: string;
}

/**
 * Which voters may vote *in* a position.
 *
 * This is the field the entire system derives behaviour from: the step engine,
 * the progress indicator, the review screen, ballot validation on both sides of
 * the wire, and the per-position weighting of results. There is deliberately no
 * `if (voter.type === 'employee')` anywhere else in the codebase.
 */
export interface Eligibility {
  /** Non-empty. A position nobody can vote in is a configuration error. */
  readonly voterTypes: readonly VoterType[];
  /** When present, restricts the electorate to members of this house. */
  readonly houseId?: string;
}

export interface Position {
  readonly id: string;
  readonly title: string;
  /** Short form for the gate sign; falls back to `title`. */
  readonly shortTitle?: string;
  /** Unique across positions; defines the gate sequence. */
  readonly order: number;
  readonly kind: PositionKind;
  /** Set for `house-captain` positions. Presentation uses it for house colour. */
  readonly houseId?: string;
  readonly eligibility: Eligibility;
}

export interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly positionId: string;
  readonly tagline?: string;
  /** Root-relative path or https URL. Anything else is rejected at config load. */
  readonly photoUrl?: string;
  /** Withdrawn candidates are deactivated, never deleted: their votes still count. */
  readonly active: boolean;
}

export interface Voter {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly type: VoterType;
  /** Required for students when house-captain positions exist. */
  readonly houseId?: string;
}

export interface ElectionConfig {
  readonly election: ElectionMeta;
  readonly houses: readonly House[];
  readonly positions: readonly Position[];
  readonly candidates: readonly Candidate[];
}

/** A completed ballot: one candidate per position the voter is eligible for. */
export type BallotSelections = Readonly<Record<string, string>>;

/** Aggregate vote counts. Results are computed from these, never from raw ballots. */
export interface Tally {
  readonly positionId: string;
  readonly candidateId: string;
  readonly voterType: VoterType;
  readonly votes: number;
}
