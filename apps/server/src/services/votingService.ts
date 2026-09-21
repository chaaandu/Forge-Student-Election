import {
  validateBallot,
  type BallotSelections,
  type ElectionConfig,
} from '@mesa/election-core';
import { transaction, type Db } from '../db/index.js';
import {
  DuplicateVoteError,
  type ElectionRepository,
  type VoterRecord,
} from '../db/electionRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import type { IdempotencyRepository } from '../db/idempotencyRepository.js';
import type { OutboxRepository } from '../db/outboxRepository.js';
import { hourBucket, newId, randomToken, sha256 } from '../lib/crypto.js';
import { electionWindow } from '../election/configStore.js';
import {
  AlreadyVotedError,
  BallotInvalidError,
  ElectionNotOpenError,
  IdempotencyConflictError,
} from './errors.js';

export interface SubmitBallotRequest {
  readonly voter: VoterRecord;
  readonly sessionId: string;
  readonly selections: BallotSelections;
  readonly idempotencyKey: string;
}

export interface SubmitBallotResult {
  readonly status: 'recorded';
  readonly receiptId: string;
  /** True when this response replays an earlier identical submission. */
  readonly replayed: boolean;
  readonly submittedAt: string;
}

/** Canonical form so `{a,b}` and `{b,a}` hash identically. */
function canonicalSelections(selections: BallotSelections): string {
  return JSON.stringify(
    Object.keys(selections)
      .sort()
      .map((k) => [k, selections[k]]),
  );
}

/**
 * The only path by which a vote is recorded.
 *
 * Everything in the system exists to make this method's guarantees true:
 * exactly one ballot per voter, validated against the server's own voter
 * record, recorded atomically together with the participation mark, the audit
 * entry and the spreadsheet outbox — or not at all.
 *
 * See docs/architecture.md §4 for the step-by-step contract.
 */
export class VotingService {
  constructor(
    private readonly db: Db,
    private readonly repo: ElectionRepository,
    private readonly audit: AuditRepository,
    private readonly idempotency: IdempotencyRepository,
    private readonly outbox: OutboxRepository,
    private readonly config: ElectionConfig,
    private readonly configVersion: string,
  ) {}

  submitBallot(request: SubmitBallotRequest, now: Date = new Date()): SubmitBallotResult {
    try {
      return this.attempt(request, now);
    } catch (error) {
      // The transaction has already rolled back, so this entry is the only
      // durable record that the attempt happened at all.
      this.auditFailure(request, error, now);
      throw error;
    }
  }

  /**
   * Audit a rejected submission.
   *
   * Runs outside the transaction on purpose: an entry appended inside a
   * transaction that then aborts is discarded with it, which would leave every
   * rejection invisible — exactly the events an election most needs recorded.
   * Issue codes and reasons only; never the selections.
   */
  private auditFailure(request: SubmitBallotRequest, error: unknown, now: Date): void {
    const actorId = request.voter.id;
    try {
      if (error instanceof AlreadyVotedError) {
        this.audit.append(
          {
            event: 'DUPLICATE_VOTE_ATTEMPT',
            actorType: 'voter',
            actorId,
            metadata: { previouslyVotedAt: error.votedAt },
          },
          now,
        );
        return;
      }
      if (error instanceof BallotInvalidError) {
        this.audit.append(
          {
            event: 'BALLOT_REJECTED',
            actorType: 'voter',
            actorId,
            metadata: { reason: 'validation', issues: error.issues.map((i) => i.code) },
          },
          now,
        );
        return;
      }
      if (error instanceof ElectionNotOpenError || error instanceof IdempotencyConflictError) {
        this.audit.append(
          {
            event: 'BALLOT_REJECTED',
            actorType: 'voter',
            actorId,
            metadata: { reason: error.code },
          },
          now,
        );
        return;
      }
      this.audit.append(
        {
          event: 'BALLOT_REJECTED',
          actorType: 'voter',
          actorId,
          metadata: { reason: 'unexpected_error' },
        },
        now,
      );
    } catch {
      // Auditing must never mask the original failure the voter needs to see.
    }
  }

  private attempt(request: SubmitBallotRequest, now: Date): SubmitBallotResult {
    const { voter, selections, idempotencyKey } = request;
    const requestHash = sha256(`${voter.id}:${canonicalSelections(selections)}`);

    return transaction(this.db, () => {
      // 1. Idempotency. A retried submission must replay, never re-record.
      const existing = this.idempotency.find(idempotencyKey);
      if (existing) {
        if (existing.voterId !== voter.id) {
          throw new IdempotencyConflictError('key already used by a different voter');
        }
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError('key reused with different selections');
        }
        if (existing.status === 'completed' && existing.responseBody) {
          this.audit.append(
            {
              event: 'IDEMPOTENT_REPLAY',
              actorType: 'voter',
              actorId: voter.id,
              metadata: { idempotencyKey: idempotencyKey.slice(0, 8) },
            },
            now,
          );
          const body = existing.responseBody as SubmitBallotResult;
          return { ...body, replayed: true };
        }
        throw new IdempotencyConflictError('an identical submission is still in progress');
      }

      // 2. The election window is checked server-side, every time.
      const window = electionWindow(this.config, now);
      if (!window.open) throw new ElectionNotOpenError(window.reason, window.at);

      // 3. Re-read the voter inside the transaction. The caller's copy was read
      //    before the write lock was held and could be stale.
      const current = this.repo.findVoterById(voter.id);
      if (!current) throw new AlreadyVotedError(null);

      // NOTE: rejection paths do NOT audit here — this transaction is about to
      // roll back and would take the audit entry with it. Failures are audited
      // by the caller below, after the rollback. See `auditFailure`.
      if (current.hasVoted) throw new AlreadyVotedError(current.votedAt);

      // 4. Validate against the voter record the SERVER loaded. Nothing from the
      //    request body contributes to eligibility — not the voter id, not the
      //    voter type. A forged type in the payload has nowhere to take effect.
      const validation = validateBallot(this.config, current, selections);
      if (!validation.valid) throw new BallotInvalidError(validation.issues);

      // 5. Record. Anonymous ballot and attributable participation, together.
      const ballotId = newId();
      const receiptId = randomToken(16);
      const nowIso = now.toISOString();

      try {
        this.repo.recordBallot({
          ballotId,
          electionId: this.config.election.id,
          voterId: current.id,
          voterType: current.type,
          submittedHour: hourBucket(now),
          configVersion: this.configVersion,
          selections,
          receiptId,
          now: nowIso,
        });
      } catch (error) {
        // The compare-and-swap or the vote_receipts primary key lost the race.
        // Another request for this voter committed first; this one records nothing.
        if (
          error instanceof DuplicateVoteError ||
          (error instanceof Error && /UNIQUE constraint|PRIMARY KEY/i.test(error.message))
        ) {
          throw new AlreadyVotedError(current.votedAt);
        }
        throw error;
      }

      // 6. Enqueue the spreadsheet mirror in the same transaction, so "recorded"
      //    and "queued to sync" can never disagree.
      this.outbox.enqueue(
        'participation',
        `participation:${current.id}`,
        {
          voterId: current.id,
          name: current.name,
          email: current.email,
          type: current.type,
          houseId: current.houseId ?? null,
          hasVoted: true,
          votedAt: nowIso,
        },
        now,
      );
      this.outbox.enqueue(
        'ballot',
        `ballot:${ballotId}`,
        {
          ballotId,
          electionId: this.config.election.id,
          voterType: current.type,
          submittedHour: hourBucket(now),
          selections: Object.entries(selections).map(([positionId, candidateId]) => ({
            positionId,
            candidateId,
          })),
        },
        now,
      );

      // 7. Audit that this voter participated. Deliberately no ballot id here:
      //    putting both in one row would re-link identity to ballot.
      this.audit.append(
        {
          event: 'BALLOT_SUBMITTED',
          actorType: 'voter',
          actorId: current.id,
          metadata: { voterType: current.type, positions: Object.keys(selections).length },
        },
        now,
      );

      const result: SubmitBallotResult = {
        status: 'recorded',
        receiptId,
        replayed: false,
        submittedAt: nowIso,
      };

      this.idempotency.complete({
        key: idempotencyKey,
        voterId: current.id,
        requestHash,
        responseCode: 201,
        responseBody: result,
        now: nowIso,
      });

      return result;
    });
  }
}
