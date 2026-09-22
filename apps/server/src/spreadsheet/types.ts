/**
 * The spreadsheet port.
 *
 * The spreadsheet is a downstream mirror, never the source of truth (ADR-5).
 * This interface is the only place in the system that knows a sheet's shape;
 * everything upstream passes domain objects.
 *
 * Three implementations ship: Google Sheets (the one Mesa uses), Excel via
 * Microsoft Graph, and a local JSONL spool for development. Swapping in a CSV
 * drop — or nothing at all — is another implementation of this interface, not a
 * change anywhere above it.
 */

export interface VoterParticipationRow {
  readonly voterId: string;
  readonly name: string;
  readonly email: string;
  readonly type: string;
  readonly houseId: string | null;
  /**
   * The house as a reader of the sheet sees it — "Gladiators", not
   * "gladiators". The roll is seeded with names, and a mirror that spelled the
   * same house two ways in two tabs is one anybody sorting, filtering or
   * writing their own formula over it has to know a trick to use.
   */
  readonly house: string;
  readonly hasVoted: boolean;
  readonly votedAt: string;
}

export interface BallotSelectionRow {
  readonly ballotId: string;
  readonly electionId: string;
  readonly voterType: string;
  readonly submittedHour: string;
  readonly positionId: string;
  readonly candidateId: string;
  /** Stable across retries. Makes at-least-once delivery detectable downstream. */
  readonly dedupeKey: string;
}

export interface CandidateRow {
  readonly candidateId: string;
  readonly name: string;
  readonly position: string;
  readonly house: string;
  readonly photoUrl: string;
  readonly active: boolean;
}

export interface ResultRow {
  readonly position: string;
  readonly weightingApplied: string;
  readonly candidate: string;
  readonly studentVotes: number | '';
  readonly studentPct: number | '';
  readonly studentContribution: number | '';
  readonly employeeVotes: number | '';
  readonly employeePct: number | '';
  readonly employeeContribution: number | '';
  readonly weightedScore: number;
  readonly rank: number;
  readonly tied: boolean;
  readonly generatedAt: string;
}

export interface SpreadsheetHealth {
  readonly ok: boolean;
  readonly mode: string;
  readonly detail: string;
}

export interface SpreadsheetRepository {
  readonly mode: 'sheets' | 'graph' | 'spool';
  appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void>;
  appendBallotSelections(rows: readonly BallotSelectionRow[]): Promise<void>;
  upsertCandidates(rows: readonly CandidateRow[]): Promise<void>;
  appendResults(rows: readonly ResultRow[]): Promise<void>;
  /**
   * Empty the tabs the election writes to, back to their header rows.
   *
   * Only ever called by a confirmed reset. The candidate list and the roll are
   * configuration and are left alone.
   */
  clearElectionData(): Promise<void>;
  health(): Promise<SpreadsheetHealth>;
}

/** Worth retrying: throttling, transient network, 5xx. */
export class SpreadsheetTransientError extends Error {
  override readonly name = 'SpreadsheetTransientError';
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Not worth retrying: bad credentials, missing table, malformed request. */
export class SpreadsheetPermanentError extends Error {
  override readonly name = 'SpreadsheetPermanentError';
  constructor(message: string) {
    super(message);
  }
}
