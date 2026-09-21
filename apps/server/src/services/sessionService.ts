import type { Db } from '../db/index.js';
import type { ElectionRepository, VoterRecord } from '../db/electionRepository.js';
import { newId, randomToken, saltedHash, sha256 } from '../lib/crypto.js';

export interface SessionBinding {
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface IssuedSession {
  /** Returned to the client exactly once. Only its SHA-256 is stored. */
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: string;
}

export type SessionResolution =
  | { ok: true; sessionId: string; voter: VoterRecord }
  | { ok: false; reason: 'UNKNOWN' | 'EXPIRED' | 'REVOKED' | 'BINDING_MISMATCH' };

/**
 * Voting sessions.
 *
 * Opaque 256-bit tokens, stored hashed, sent as `Authorization: Bearer` and
 * never as a cookie — which removes CSRF from the threat model by construction.
 * A session buys exactly one ballot: it is revoked the moment one is recorded.
 */
export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly repo: ElectionRepository,
    private readonly hashSalt: string,
    private readonly ttlMinutes: number,
  ) {}

  issue(voterId: string, binding: SessionBinding = {}, now: Date = new Date()): IssuedSession {
    const token = randomToken(32);
    const sessionId = newId();
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000).toISOString();

    this.db
      .prepare(
        `INSERT INTO sessions (id, token_hash, voter_id, created_at, expires_at, ip_hash, user_agent_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        sha256(token),
        voterId,
        now.toISOString(),
        expiresAt,
        binding.ip ? saltedHash(binding.ip, this.hashSalt) : null,
        binding.userAgent ? saltedHash(binding.userAgent, this.hashSalt) : null,
      );

    return { token, sessionId, expiresAt };
  }

  /**
   * Resolve a bearer token to a voter.
   *
   * A binding mismatch (the session moving to a different device mid-ballot)
   * revokes the session rather than merely rejecting the request: if a token has
   * leaked, the safe action is to end it.
   */
  resolve(
    token: string,
    binding: SessionBinding = {},
    now: Date = new Date(),
  ): SessionResolution {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token)) as
      | {
          id: string;
          voter_id: string;
          expires_at: string;
          revoked_at: string | null;
          ip_hash: string | null;
          user_agent_hash: string | null;
        }
      | undefined;

    if (!row) return { ok: false, reason: 'UNKNOWN' };
    if (row.revoked_at !== null) return { ok: false, reason: 'REVOKED' };
    if (new Date(row.expires_at) < now) return { ok: false, reason: 'EXPIRED' };

    if (row.ip_hash && binding.ip && row.ip_hash !== saltedHash(binding.ip, this.hashSalt)) {
      this.revoke(row.id, now);
      return { ok: false, reason: 'BINDING_MISMATCH' };
    }
    if (
      row.user_agent_hash &&
      binding.userAgent &&
      row.user_agent_hash !== saltedHash(binding.userAgent, this.hashSalt)
    ) {
      this.revoke(row.id, now);
      return { ok: false, reason: 'BINDING_MISMATCH' };
    }

    const voter = this.repo.findVoterById(row.voter_id);
    if (!voter) return { ok: false, reason: 'UNKNOWN' };

    return { ok: true, sessionId: row.id, voter };
  }

  revoke(sessionId: string, now: Date = new Date()): void {
    this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(now.toISOString(), sessionId);
  }

  /** Housekeeping: expired sessions are linkage surface with no remaining use. */
  purgeExpired(olderThanHours = 24, now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - olderThanHours * 3_600_000).toISOString();
    return this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(cutoff).changes;
  }
}
