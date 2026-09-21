import type { BallotSelections, Tally, Voter, VoterType } from '@mesa/election-core';
import type { Db } from './index.js';

export interface VoterRecord extends Voter {
  readonly electionId: string;
  readonly hasVoted: boolean;
  readonly votedAt: string | null;
  readonly accessCodeHash: string | null;
  readonly accessCodeSalt: string | null;
  readonly failedAttempts: number;
  readonly lockedUntil: string | null;
}

interface VoterRow {
  id: string;
  election_id: string;
  name: string;
  email: string;
  email_norm: string;
  type: VoterType;
  house_id: string | null;
  access_code_hash: string | null;
  access_code_salt: string | null;
  failed_attempts: number;
  locked_until: string | null;
  has_voted: number;
  voted_at: string | null;
}

function toVoter(row: VoterRow): VoterRecord {
  return {
    id: row.id,
    electionId: row.election_id,
    name: row.name,
    email: row.email,
    type: row.type,
    ...(row.house_id !== null ? { houseId: row.house_id } : {}),
    hasVoted: row.has_voted === 1,
    votedAt: row.voted_at,
    accessCodeHash: row.access_code_hash,
    accessCodeSalt: row.access_code_salt,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
}

export class DuplicateVoteError extends Error {
  override readonly name = 'DuplicateVoteError';
  constructor(readonly voterId: string) {
    super(`Voter ${voterId} has already cast a ballot.`);
  }
}

/**
 * The port between the services and storage.
 *
 * Swapping SQLite for another database means implementing this interface; no
 * service reaches for SQL directly. See ADR-3.
 */
export class ElectionRepository {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------- voters ---

  upsertVoter(
    voter: Voter,
    electionId: string,
    codes?: { hash: string; salt: string },
  ): void {
    this.db
      .prepare(
        `INSERT INTO voters (id, election_id, name, email, email_norm, type, house_id,
                             access_code_hash, access_code_salt)
         VALUES (@id, @electionId, @name, @email, @emailNorm, @type, @houseId, @hash, @salt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           email_norm = excluded.email_norm,
           type = excluded.type,
           house_id = excluded.house_id,
           access_code_hash = COALESCE(excluded.access_code_hash, voters.access_code_hash),
           access_code_salt = COALESCE(excluded.access_code_salt, voters.access_code_salt)`,
      )
      .run({
        id: voter.id,
        electionId,
        name: voter.name,
        email: voter.email,
        emailNorm: voter.email.trim().toLowerCase(),
        type: voter.type,
        houseId: voter.houseId ?? null,
        hash: codes?.hash ?? null,
        salt: codes?.salt ?? null,
      });
  }

  findVoterById(id: string): VoterRecord | undefined {
    const row = this.db.prepare('SELECT * FROM voters WHERE id = ?').get(id) as
      | VoterRow
      | undefined;
    return row ? toVoter(row) : undefined;
  }

  findVoterByEmail(email: string, electionId: string): VoterRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM voters WHERE election_id = ? AND email_norm = ?')
      .get(electionId, email.trim().toLowerCase()) as VoterRow | undefined;
    return row ? toVoter(row) : undefined;
  }

  /**
   * Type-ahead over the roll.
   *
   * Deliberately narrow: a minimum query length and a hard result cap are what
   * stop this becoming a roll-export endpoint. Email masking happens in the
   * route layer, which is the boundary that knows what leaves the building.
   */
  searchVoters(query: string, electionId: string, limit = 8): VoterRecord[] {
    const term = `%${query.trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM voters
         WHERE election_id = ? AND (LOWER(name) LIKE ? OR email_norm LIKE ?)
         ORDER BY name ASC LIMIT ?`,
      )
      .all(electionId, term, term, limit) as VoterRow[];
    return rows.map(toVoter);
  }

  listVoters(electionId: string): VoterRecord[] {
    return (
      this.db.prepare('SELECT * FROM voters WHERE election_id = ? ORDER BY name').all(electionId) as
        VoterRow[]
    ).map(toVoter);
  }

  countVoters(electionId: string): Record<VoterType, number> {
    const rows = this.db
      .prepare('SELECT type, COUNT(*) AS n FROM voters WHERE election_id = ? GROUP BY type')
      .all(electionId) as { type: VoterType; n: number }[];
    const counts = { student: 0, employee: 0 } as Record<VoterType, number>;
    for (const row of rows) counts[row.type] = row.n;
    return counts;
  }

  // ------------------------------------------------- access code attempts ---

  recordFailedAttempt(voterId: string, lockUntil: string | null): void {
    this.db
      .prepare(
        `UPDATE voters SET failed_attempts = failed_attempts + 1, locked_until = ? WHERE id = ?`,
      )
      .run(lockUntil, voterId);
  }

  clearFailedAttempts(voterId: string): void {
    this.db
      .prepare('UPDATE voters SET failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(voterId);
  }

  // ------------------------------------------------------------ ballots ---

  /**
   * Record one ballot and mark the voter as having voted.
   *
   * MUST be called inside an IMMEDIATE transaction. Three independent
   * mechanisms prevent a second ballot:
   *   1. the caller's `hasVoted` precondition check,
   *   2. the PRIMARY KEY on `vote_receipts`,
   *   3. the conditional UPDATE below, whose row count is asserted.
   * Any one of them suffices; (3) is the one that holds under concurrency.
   */
  recordBallot(params: {
    ballotId: string;
    electionId: string;
    voterId: string;
    voterType: VoterType;
    submittedHour: string;
    configVersion: string;
    selections: BallotSelections;
    receiptId: string;
    now: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ballots (id, election_id, voter_type, submitted_hour, config_version)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        params.ballotId,
        params.electionId,
        params.voterType,
        params.submittedHour,
        params.configVersion,
      );

    const insertSelection = this.db.prepare(
      'INSERT INTO ballot_selections (ballot_id, position_id, candidate_id) VALUES (?, ?, ?)',
    );
    for (const [positionId, candidateId] of Object.entries(params.selections)) {
      insertSelection.run(params.ballotId, positionId, candidateId);
    }

    // Hard uniqueness: throws SQLITE_CONSTRAINT_PRIMARYKEY on a second attempt.
    this.db
      .prepare(
        'INSERT INTO vote_receipts (voter_id, election_id, receipt_id, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(params.voterId, params.electionId, params.receiptId, params.now);

    // Compare-and-swap: the precondition is re-asserted by the write itself.
    const result = this.db
      .prepare('UPDATE voters SET has_voted = 1, voted_at = ? WHERE id = ? AND has_voted = 0')
      .run(params.now, params.voterId);

    if (result.changes !== 1) throw new DuplicateVoteError(params.voterId);
  }

  // ------------------------------------------------------------ tallies ---

  tallies(electionId: string): Tally[] {
    return this.db
      .prepare(
        `SELECT s.position_id AS positionId,
                s.candidate_id AS candidateId,
                b.voter_type   AS voterType,
                COUNT(*)       AS votes
         FROM ballot_selections s
         JOIN ballots b ON b.id = s.ballot_id
         WHERE b.election_id = ?
         GROUP BY s.position_id, s.candidate_id, b.voter_type`,
      )
      .all(electionId) as Tally[];
  }

  ballotCountsByType(electionId: string): Partial<Record<VoterType, number>> {
    const rows = this.db
      .prepare(
        'SELECT voter_type AS type, COUNT(*) AS n FROM ballots WHERE election_id = ? GROUP BY voter_type',
      )
      .all(electionId) as { type: VoterType; n: number }[];
    const counts: Partial<Record<VoterType, number>> = {};
    for (const row of rows) counts[row.type] = row.n;
    return counts;
  }

  turnout(electionId: string): { byType: Record<VoterType, { eligible: number; voted: number }> } {
    const rows = this.db
      .prepare(
        `SELECT type, COUNT(*) AS eligible, SUM(has_voted) AS voted
         FROM voters WHERE election_id = ? GROUP BY type`,
      )
      .all(electionId) as { type: VoterType; eligible: number; voted: number | null }[];

    const byType = {
      student: { eligible: 0, voted: 0 },
      employee: { eligible: 0, voted: 0 },
    } as Record<VoterType, { eligible: number; voted: number }>;
    for (const row of rows) byType[row.type] = { eligible: row.eligible, voted: row.voted ?? 0 };
    return { byType };
  }

  countBallots(electionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM ballots WHERE election_id = ?')
      .get(electionId) as { n: number };
    return row.n;
  }
}
