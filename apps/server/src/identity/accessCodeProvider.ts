import type { ElectionRepository } from '../db/electionRepository.js';
import { hashAccessCode, normaliseAccessCode, safeEquals } from '../lib/crypto.js';
import type { IdentityOutcome, IdentityProvider } from './types.js';

export const MAX_CODE_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * One-time access codes, handed out physically against a student ID.
 *
 * The kiosk fallback for a hall where per-student device login is impractical.
 * Weaker than Entra — a slip can be handed over — and that trade is stated
 * openly in docs/security-model.md §3.2 rather than hidden.
 *
 * The system stores only a scrypt hash with a per-voter salt and a global
 * pepper, so it cannot tell a voter their own code; it can only issue a new one.
 */
export class AccessCodeProvider implements IdentityProvider {
  readonly mode = 'access-code' as const;
  readonly supportsRollSearch = true;
  readonly requiresSupervision = false;

  constructor(
    private readonly repo: ElectionRepository,
    private readonly pepper: string,
  ) {}

  verify(voterId: string, code: string, now: Date = new Date()): IdentityOutcome {
    const voter = this.repo.findVoterById(voterId);

    // A missing voter and a wrong code return the same shape and the same
    // timing cost, so this endpoint cannot be used to enumerate the roll.
    if (!voter || !voter.accessCodeHash || !voter.accessCodeSalt) {
      return {
        ok: false,
        code: 'INVALID_CODE',
        message: 'That code is not correct. Check your slip and try again.',
      };
    }

    if (voter.lockedUntil && new Date(voter.lockedUntil) > now) {
      const retryAfterSeconds = Math.ceil(
        (new Date(voter.lockedUntil).getTime() - now.getTime()) / 1000,
      );
      return {
        ok: false,
        code: 'LOCKED_OUT',
        message:
          'Too many incorrect codes. This has been paused for a few minutes — ' +
          'please see the returning officer.',
        retryAfterSeconds,
      };
    }

    const normalised = normaliseAccessCode(code);
    const candidateHash = hashAccessCode(normalised, voter.accessCodeSalt, this.pepper);

    if (!safeEquals(candidateHash, voter.accessCodeHash)) {
      const attempts = voter.failedAttempts + 1;
      const shouldLock = attempts >= MAX_CODE_ATTEMPTS;
      const lockUntil = shouldLock
        ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString()
        : null;
      this.repo.recordFailedAttempt(voter.id, lockUntil);

      if (shouldLock) {
        return {
          ok: false,
          code: 'LOCKED_OUT',
          message:
            'Too many incorrect codes. This has been paused for a few minutes — ' +
            'please see the returning officer.',
          retryAfterSeconds: LOCKOUT_MINUTES * 60,
        };
      }

      return {
        ok: false,
        code: 'INVALID_CODE',
        message: 'That code is not correct. Check your slip and try again.',
        attemptsRemaining: MAX_CODE_ATTEMPTS - attempts,
      };
    }

    this.repo.clearFailedAttempts(voter.id);
    return { ok: true, voter };
  }
}
