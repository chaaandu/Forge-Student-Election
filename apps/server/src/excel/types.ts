/**
 * The Excel port.
 *
 * Excel is a downstream mirror, never the source of truth (ADR-5). This
 * interface is the only place in the system that knows the workbook's shape;
 * everything upstream passes domain objects. Swapping Excel for Google Sheets,
 * a CSV drop, or nothing at all is an implementation of this interface.
 */

export interface VoterParticipationRow {
  readonly voterId: string;
  readonly name: string;
  readonly email: string;
  readonly type: string;
  readonly houseId: string | null;
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

export interface ExcelHealth {
  readonly ok: boolean;
  readonly mode: string;
  readonly detail: string;
}

export interface ExcelRepository {
  readonly mode: 'graph' | 'null';
  appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void>;
  appendBallotSelections(rows: readonly BallotSelectionRow[]): Promise<void>;
  upsertCandidates(rows: readonly CandidateRow[]): Promise<void>;
  appendResults(rows: readonly ResultRow[]): Promise<void>;
  health(): Promise<ExcelHealth>;
}

/** Worth retrying: throttling, transient network, 5xx. */
export class ExcelTransientError extends Error {
  override readonly name = 'ExcelTransientError';
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Not worth retrying: bad credentials, missing table, malformed request. */
export class ExcelPermanentError extends Error {
  override readonly name = 'ExcelPermanentError';
  constructor(message: string) {
    super(message);
  }
}
