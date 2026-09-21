import type { Db } from './index.js';

export interface IdempotencyRecord {
  readonly key: string;
  readonly voterId: string;
  readonly requestHash: string;
  readonly status: 'in_flight' | 'completed';
  readonly responseCode: number | null;
  readonly responseBody: unknown;
}

interface RawRow {
  key: string;
  voter_id: string;
  request_hash: string;
  status: 'in_flight' | 'completed';
  response_code: number | null;
  response_body: string | null;
}

/**
 * Idempotency for ballot submission.
 *
 * The frontend generates one key per ballot — not per attempt — so a retry after
 * a timeout carries the same key and replays the original outcome instead of
 * creating a second ballot.
 */
export class IdempotencyRepository {
  constructor(private readonly db: Db) {}

  find(key: string): IdempotencyRecord | undefined {
    const row = this.db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key) as
      | RawRow
      | undefined;
    if (!row) return undefined;
    return {
      key: row.key,
      voterId: row.voter_id,
      requestHash: row.request_hash,
      status: row.status,
      responseCode: row.response_code,
      responseBody: row.response_body ? JSON.parse(row.response_body) : null,
    };
  }

  complete(params: {
    key: string;
    voterId: string;
    requestHash: string;
    responseCode: number;
    responseBody: unknown;
    now: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO idempotency_keys
           (key, voter_id, request_hash, status, response_code, response_body, created_at)
         VALUES (?, ?, ?, 'completed', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           status = 'completed',
           response_code = excluded.response_code,
           response_body = excluded.response_body`,
      )
      .run(
        params.key,
        params.voterId,
        params.requestHash,
        params.responseCode,
        JSON.stringify(params.responseBody),
        params.now,
      );
  }
}
