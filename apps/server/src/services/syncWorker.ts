import type { AuditRepository } from '../db/auditRepository.js';
import type { OutboxRepository, OutboxRow } from '../db/outboxRepository.js';
import type {
  BallotSelectionRow,
  SpreadsheetRepository,
  VoterParticipationRow,
} from '../spreadsheet/types.js';
import { SpreadsheetPermanentError } from '../spreadsheet/types.js';

export interface SyncWorkerOptions {
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly maxAttempts: number;
}

export interface SyncRunSummary {
  readonly claimed: number;
  readonly synced: number;
  readonly retried: number;
  readonly deadLettered: number;
}

/**
 * Drains the outbox into the configured spreadsheet.
 *
 * The vote is already durable before this runs, so every failure mode here is a
 * delay, not a loss. Transient failures back off and retry; permanent ones
 * dead-letter after `maxAttempts` and surface on /api/admin/sync/status rather
 * than disappearing into a log.
 */
export class SyncWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly excel: SpreadsheetRepository,
    private readonly audit: AuditRepository,
    private readonly options: SyncWorkerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    // Anything left `in_flight` means the process died mid-send. Release it:
    // at-least-once beats silently dropping a row.
    this.outbox.releaseStale();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.options.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(now: Date = new Date()): Promise<SyncRunSummary> {
    if (this.running) return { claimed: 0, synced: 0, retried: 0, deadLettered: 0 };
    this.running = true;

    try {
      const batch = this.outbox.claimBatch(this.options.batchSize, now);
      let synced = 0;
      let retried = 0;
      let deadLettered = 0;

      for (const row of batch) {
        try {
          await this.send(row);
          this.outbox.markSynced(row.id, now);
          synced += 1;
        } catch (error) {
          const message = (error as Error).message;
          const permanent = error instanceof SpreadsheetPermanentError;
          const outcome = this.outbox.markFailed(
            row.id,
            message,
            permanent ? 1 : this.options.maxAttempts,
            now,
          );

          if (outcome.deadLettered) {
            deadLettered += 1;
            this.audit.append(
              {
                event: 'SYNC_DEAD_LETTERED',
                actorType: 'system',
                subjectId: row.dedupeKey,
                metadata: { kind: row.kind, attempts: outcome.attempts, reason: message.slice(0, 200) },
              },
              now,
            );
          } else {
            retried += 1;
            this.audit.append(
              {
                event: 'SYNC_FAILED',
                actorType: 'system',
                subjectId: row.dedupeKey,
                metadata: { kind: row.kind, attempts: outcome.attempts, reason: message.slice(0, 200) },
              },
              now,
            );
          }
        }
      }

      return { claimed: batch.length, synced, retried, deadLettered };
    } finally {
      this.running = false;
    }
  }

  private async send(row: OutboxRow): Promise<void> {
    switch (row.kind) {
      case 'participation': {
        const payload = row.payload as VoterParticipationRow;
        await this.excel.appendVoterParticipation([payload]);
        return;
      }
      case 'ballot': {
        const payload = row.payload as {
          ballotId: string;
          electionId: string;
          voterType: string;
          submittedHour: string;
          selections: { positionId: string; candidateId: string }[];
        };
        const rows: BallotSelectionRow[] = payload.selections.map((s) => ({
          ballotId: payload.ballotId,
          electionId: payload.electionId,
          voterType: payload.voterType,
          submittedHour: payload.submittedHour,
          positionId: s.positionId,
          candidateId: s.candidateId,
          dedupeKey: `${row.dedupeKey}:${s.positionId}`,
        }));
        await this.excel.appendBallotSelections(rows);
        return;
      }
      case 'candidates_snapshot': {
        await this.excel.upsertCandidates(row.payload as never);
        return;
      }
      case 'results_snapshot': {
        await this.excel.appendResults(row.payload as never);
        return;
      }
      default:
        throw new SpreadsheetPermanentError(`Unknown outbox kind "${row.kind}"`);
    }
  }
}
