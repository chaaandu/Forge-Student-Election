import { createHash } from 'node:crypto';
import { transaction, type Db } from './index.js';

export const AUDIT_EVENTS = [
  'SESSION_STARTED',
  'IDENTITY_VERIFIED',
  'IDENTITY_FAILED',
  'VOTER_NOT_ON_ROLL',
  'ACCESS_CODE_LOCKED',
  'BALLOT_SUBMITTED',
  'BALLOT_REJECTED',
  'DUPLICATE_VOTE_ATTEMPT',
  'IDEMPOTENT_REPLAY',
  'SESSION_BINDING_MISMATCH',
  'ELECTION_CONFIG_LOADED',
  'RESULTS_GENERATED',
  'ADMIN_ACCESS',
  'ADMIN_SIGN_IN',
  /**
   * The election was wiped back to a clean roll. Recorded rather than erased:
   * the log survives a reset precisely so that a count which vanished is
   * provably a reset and not a disappearance.
   */
  'ELECTION_RESET',
  'SYNC_FAILED',
  'SYNC_DEAD_LETTERED',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export interface AuditEntry {
  readonly event: AuditEvent;
  readonly actorType: 'voter' | 'admin' | 'system';
  readonly actorId?: string;
  readonly subjectId?: string;
  /** Never ballot selections, never secrets. Enforced by review and by the redaction below. */
  readonly metadata?: Record<string, unknown>;
}

const GENESIS = '0'.repeat(64);

/**
 * Keys we refuse to write into the audit log even if a caller passes them.
 *
 * Defence in depth: the calling code is already careful, but a future change
 * that adds `selections` to a metadata object should fail loudly here rather
 * than quietly destroying ballot secrecy.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  'selections',
  'selection',
  'ballot',
  'candidateId',
  'candidate_id',
  'token',
  'accessCode',
  'access_code',
  'password',
  'secret',
]);

export class ForbiddenAuditMetadataError extends Error {
  override readonly name = 'ForbiddenAuditMetadataError';
  constructor(key: string) {
    super(
      `Refusing to write "${key}" to the audit log: ballot contents and secrets must never ` +
        `be logged. See docs/security-model.md §7.`,
    );
  }
}

function canonical(row: {
  seq: number;
  at: string;
  event: string;
  actorType: string;
  actorId: string | null;
  subjectId: string | null;
  metadata: string | null;
}): string {
  return JSON.stringify([
    row.seq,
    row.at,
    row.event,
    row.actorType,
    row.actorId,
    row.subjectId,
    row.metadata,
  ]);
}

export class AuditRepository {
  constructor(private readonly db: Db) {}

  /**
   * Append one entry, chaining it to the previous row's hash.
   *
   * Reading the previous hash and inserting the next row must happen under the
   * same write lock: two processes that read `MAX(seq)` concurrently would
   * otherwise compute the same sequence number and the same predecessor, and
   * one of them would fail on the primary key — or worse, silently fork the
   * chain. When the caller already holds a transaction (the ballot path does,
   * so that the log and the vote commit together) we join it; otherwise we take
   * our own.
   */
  append(entry: AuditEntry, now: Date = new Date()): void {
    if (this.db.inTransaction) {
      this.appendLocked(entry, now);
      return;
    }
    transaction(this.db, () => this.appendLocked(entry, now));
  }

  private appendLocked(entry: AuditEntry, now: Date): void {
    if (entry.metadata) {
      for (const key of Object.keys(entry.metadata)) {
        if (FORBIDDEN_METADATA_KEYS.has(key)) throw new ForbiddenAuditMetadataError(key);
      }
    }

    const previous = this.db
      .prepare('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1')
      .get() as { hash: string } | undefined;
    const prevHash = previous?.hash ?? GENESIS;

    const nextSeq =
      ((this.db.prepare('SELECT MAX(seq) AS max FROM audit_log').get() as { max: number | null })
        .max ?? 0) + 1;

    const row = {
      seq: nextSeq,
      at: now.toISOString(),
      event: entry.event,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      subjectId: entry.subjectId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    };

    const hash = createHash('sha256')
      .update(`${prevHash}${canonical(row)}`, 'utf8')
      .digest('hex');

    this.db
      .prepare(
        `INSERT INTO audit_log (seq, at, event, actor_type, actor_id, subject_id, metadata, prev_hash, hash)
         VALUES (@seq, @at, @event, @actorType, @actorId, @subjectId, @metadata, @prevHash, @hash)`,
      )
      .run({ ...row, prevHash, hash });
  }

  list(limit = 200, event?: string) {
    const sql = event
      ? 'SELECT * FROM audit_log WHERE event = ? ORDER BY seq DESC LIMIT ?'
      : 'SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?';
    const params = event ? [event, limit] : [limit];
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Walk the chain and report the first break.
   *
   * A break means a row was edited, removed, or inserted out of band — the log
   * cannot prove *what* was changed, only that the history is no longer intact.
   */
  verify(): { valid: boolean; entries: number; brokenAtSeq?: number; reason?: string } {
    const rows = this.db.prepare('SELECT * FROM audit_log ORDER BY seq ASC').all() as {
      seq: number;
      at: string;
      event: string;
      actor_type: string;
      actor_id: string | null;
      subject_id: string | null;
      metadata: string | null;
      prev_hash: string;
      hash: string;
    }[];

    let expectedPrev = GENESIS;
    for (const row of rows) {
      if (row.prev_hash !== expectedPrev) {
        return {
          valid: false,
          entries: rows.length,
          brokenAtSeq: row.seq,
          reason: 'prev_hash does not match the previous entry — a row was removed or reordered',
        };
      }
      const recomputed = createHash('sha256')
        .update(
          `${row.prev_hash}${canonical({
            seq: row.seq,
            at: row.at,
            event: row.event,
            actorType: row.actor_type,
            actorId: row.actor_id,
            subjectId: row.subject_id,
            metadata: row.metadata,
          })}`,
          'utf8',
        )
        .digest('hex');
      if (recomputed !== row.hash) {
        return {
          valid: false,
          entries: rows.length,
          brokenAtSeq: row.seq,
          reason: 'entry hash does not match its contents — this row was edited',
        };
      }
      expectedPrev = row.hash;
    }

    return { valid: true, entries: rows.length };
  }
}
