import type { ElectionConfig, Voter } from '@mesa/election-core';
import type { AuditRepository } from '../db/auditRepository.js';
import type { ElectionRepository } from '../db/electionRepository.js';
import { applySchema, transaction, type Db } from '../db/index.js';
import type { SpreadsheetRepository } from '../spreadsheet/types.js';

export interface ResetSummary {
  readonly ballotsDestroyed: number;
  readonly votersRestored: number;
  readonly spreadsheetCleared: boolean;
  readonly spreadsheetDetail: string;
}

export class ResetNotConfirmedError extends Error {
  override readonly name = 'ResetNotConfirmedError';
  constructor(expected: string) {
    super(
      `Type the election name exactly — "${expected}" — to confirm. Nothing has been changed.`,
    );
  }
}

/**
 * Child before parent. `DROP TABLE` runs an implicit delete, so a table another
 * one still references cannot go first.
 *
 * `voters` is in the list because it carries `has_voted`, and a cast vote
 * cannot be withdrawn by an UPDATE — a trigger forbids exactly that. The roll
 * is re-seeded from configuration afterwards, which is also what makes a reset
 * pick up a roll edited since the server booted.
 *
 * `audit_log` is NOT in the list, and `meta` is not either. See below.
 */
const WIPED_TABLES = [
  'ballot_selections',
  'ballots',
  'vote_receipts',
  'sessions',
  'auth_requests',
  'handoff_codes',
  'idempotency_keys',
  'outbox',
  'voters',
] as const;

/**
 * Take the election back to a clean roll.
 *
 * This exists for one moment: the gap between the rehearsal and the real thing,
 * when the practice ballots have to go. It is the documented reset the schema's
 * own triggers refer to — a vote cannot be deleted, a voter cannot be
 * un-voted, and this is the deliberate administrative act that is allowed to do
 * both, by dropping the tables and rebuilding them from the schema rather than
 * by quietly disabling the guards.
 *
 * Two things deliberately survive.
 *
 *   **The audit log.** Wiping it would make a reset indistinguishable from
 *   ballots going missing. Kept, its hash chain still verifies across the
 *   reset, and it carries an ELECTION_RESET entry saying when, and how many
 *   ballots were destroyed. A count that vanished is then provably a reset.
 *
 *   **The spreadsheet's history is not preserved** — clearing it is the point —
 *   but it is cleared FIRST. If Google is unreachable, or the workbook cannot
 *   be cleared, nothing local is touched and the caller is told. Destroying the
 *   authoritative copy while the mirror still holds the old rows is the one
 *   ordering that leaves two disagreeing records.
 */
export class ElectionReset {
  constructor(
    private readonly db: Db,
    private readonly repo: ElectionRepository,
    private readonly audit: AuditRepository,
    private readonly excel: SpreadsheetRepository,
    private readonly config: ElectionConfig,
    private readonly voters: readonly Voter[],
  ) {}

  /** What the caller must type back, exactly, for the reset to proceed. */
  get phrase(): string {
    return this.config.election.name;
  }

  async run(
    confirmation: string,
    options: { clearSpreadsheet?: boolean } = {},
    now: Date = new Date(),
  ): Promise<ResetSummary> {
    if (confirmation.trim() !== this.phrase) throw new ResetNotConfirmedError(this.phrase);

    const ballotsDestroyed = this.repo.countBallots(this.config.election.id);

    let spreadsheetCleared = false;
    let spreadsheetDetail = 'Left alone — the spreadsheet still holds the old rows.';
    if (options.clearSpreadsheet !== false) {
      // Before the local wipe, on purpose. A failure here changes nothing.
      await this.excel.clearElectionData();
      spreadsheetCleared = true;
      spreadsheetDetail = 'Voters, Ballots and Results cleared back to their header rows.';
    }

    // Foreign keys off for the drop itself: the order below is already safe,
    // but a future table added between a parent and its child should not turn
    // a reset into a half-finished one. Toggled outside the transaction —
    // SQLite ignores this pragma inside one.
    this.db.pragma('foreign_keys = OFF');
    try {
      transaction(this.db, () => {
        for (const table of WIPED_TABLES) this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        // Recreates every dropped table AND the immutability triggers that went
        // with them, from the same schema the database was built from.
        applySchema(this.db);
        for (const voter of this.voters) {
          this.repo.upsertVoter(voter, this.config.election.id);
        }
        // The results publisher's high-water mark. Left behind, it would hold
        // the old ballot total and suppress the first publish of the new count.
        this.db.prepare('DELETE FROM meta WHERE key = ?').run('results.published.ballots');
      });
    } finally {
      this.db.pragma('foreign_keys = ON');
    }

    this.audit.append(
      {
        event: 'ELECTION_RESET',
        actorType: 'admin',
        metadata: {
          ballotsDestroyed,
          votersRestored: this.voters.length,
          spreadsheetCleared,
        },
      },
      now,
    );

    return {
      ballotsDestroyed,
      votersRestored: this.voters.length,
      spreadsheetCleared,
      spreadsheetDetail,
    };
  }
}
