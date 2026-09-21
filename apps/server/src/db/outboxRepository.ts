import type { Db } from './index.js';

export type OutboxKind = 'participation' | 'ballot' | 'results_snapshot' | 'candidates_snapshot';
export type OutboxStatus = 'pending' | 'in_flight' | 'synced' | 'failed';

export interface OutboxRow {
  readonly id: number;
  readonly kind: OutboxKind;
  readonly dedupeKey: string;
  readonly payload: unknown;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly syncedAt: string | null;
}

interface RawRow {
  id: number;
  kind: OutboxKind;
  dedupe_key: string;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  synced_at: string | null;
}

function toRow(raw: RawRow): OutboxRow {
  return {
    id: raw.id,
    kind: raw.kind,
    dedupeKey: raw.dedupe_key,
    payload: JSON.parse(raw.payload),
    status: raw.status,
    attempts: raw.attempts,
    nextAttemptAt: raw.next_attempt_at,
    lastError: raw.last_error,
    createdAt: raw.created_at,
    syncedAt: raw.synced_at,
  };
}

/**
 * The transactional outbox.
 *
 * Rows are enqueued inside the ballot transaction, so "the vote is recorded"
 * and "the vote is queued for Excel" commit together or not at all. The worker
 * then drains asynchronously: Excel being down delays the mirror, never the
 * election. See ADR-5.
 */
export class OutboxRepository {
  constructor(private readonly db: Db) {}

  /**
   * Enqueue one item. Idempotent on `dedupeKey`: re-enqueueing the same logical
   * event (a retried submission, a re-run snapshot) is a no-op rather than a
   * duplicate row.
   */
  enqueue(
    kind: OutboxKind,
    dedupeKey: string,
    payload: unknown,
    now: Date = new Date(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO outbox (kind, dedupe_key, payload, status, next_attempt_at, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(dedupe_key) DO NOTHING`,
      )
      .run(kind, dedupeKey, JSON.stringify(payload), now.toISOString(), now.toISOString());
  }

  /**
   * Atomically claim a batch of due rows.
   *
   * The UPDATE ... WHERE id IN (SELECT ...) runs as one statement, so two
   * workers (or a worker and a manual retry) cannot claim the same row.
   */
  claimBatch(limit: number, now: Date = new Date()): OutboxRow[] {
    const iso = now.toISOString();
    const claimed = this.db
      .prepare(
        `UPDATE outbox SET status = 'in_flight'
         WHERE id IN (
           SELECT id FROM outbox
           WHERE status = 'pending' AND next_attempt_at <= ?
           ORDER BY id ASC LIMIT ?
         )
         RETURNING *`,
      )
      .all(iso, limit) as RawRow[];
    return claimed.map(toRow);
  }

  markSynced(id: number, now: Date = new Date()): void {
    this.db
      .prepare(`UPDATE outbox SET status = 'synced', synced_at = ?, last_error = NULL WHERE id = ?`)
      .run(now.toISOString(), id);
  }

  /**
   * Record a failed attempt and schedule a retry with exponential backoff plus
   * jitter, so a burst of failures does not retry in lockstep.
   */
  markFailed(
    id: number,
    error: string,
    maxAttempts: number,
    now: Date = new Date(),
  ): { deadLettered: boolean; attempts: number } {
    const row = this.db.prepare('SELECT attempts FROM outbox WHERE id = ?').get(id) as
      | { attempts: number }
      | undefined;
    const attempts = (row?.attempts ?? 0) + 1;

    if (attempts >= maxAttempts) {
      this.db
        .prepare(`UPDATE outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?`)
        .run(attempts, error.slice(0, 1000), id);
      return { deadLettered: true, attempts };
    }

    const backoffMs = Math.min(2 ** attempts * 1000, 5 * 60_000);
    const jitter = Math.floor(Math.random() * Math.min(backoffMs, 30_000));
    const nextAttempt = new Date(now.getTime() + backoffMs + jitter).toISOString();

    this.db
      .prepare(
        `UPDATE outbox SET status = 'pending', attempts = ?, last_error = ?, next_attempt_at = ?
         WHERE id = ?`,
      )
      .run(attempts, error.slice(0, 1000), nextAttempt, id);
    return { deadLettered: false, attempts };
  }

  /** Requeue dead-lettered rows, e.g. after the workbook is fixed. */
  retryFailed(now: Date = new Date()): number {
    const result = this.db
      .prepare(
        `UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ? WHERE status = 'failed'`,
      )
      .run(now.toISOString());
    return result.changes;
  }

  status(): Record<OutboxStatus, number> & { oldestPendingAt: string | null } {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status')
      .all() as { status: OutboxStatus; n: number }[];
    const counts = { pending: 0, in_flight: 0, synced: 0, failed: 0 } as Record<
      OutboxStatus,
      number
    >;
    for (const row of rows) counts[row.status] = row.n;

    const oldest = this.db
      .prepare(`SELECT MIN(created_at) AS at FROM outbox WHERE status IN ('pending', 'in_flight')`)
      .get() as { at: string | null };

    return { ...counts, oldestPendingAt: oldest.at };
  }

  listFailed(limit = 50): OutboxRow[] {
    return (
      this.db
        .prepare(`SELECT * FROM outbox WHERE status = 'failed' ORDER BY id DESC LIMIT ?`)
        .all(limit) as RawRow[]
    ).map(toRow);
  }

  /**
   * Release rows stuck `in_flight` — only possible if the process died mid-send.
   * Called at startup. At-least-once delivery means a released row may produce a
   * duplicate workbook row; the `dedupe_key` written alongside makes that
   * detectable by the reconciliation report.
   */
  releaseStale(now: Date = new Date()): number {
    const result = this.db
      .prepare(`UPDATE outbox SET status = 'pending', next_attempt_at = ? WHERE status = 'in_flight'`)
      .run(now.toISOString());
    return result.changes;
  }
}
