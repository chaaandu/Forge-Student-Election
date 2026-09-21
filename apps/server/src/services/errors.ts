import type { BallotIssue } from '@mesa/election-core';

/** Base for errors the HTTP layer maps to a stable machine code + plain-language message. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  /** Safe to show a voter verbatim. */
  abstract readonly userMessage: string;
}

export class AlreadyVotedError extends AppError {
  override readonly name = 'AlreadyVotedError';
  readonly code = 'ALREADY_VOTED';
  readonly httpStatus = 409;
  readonly userMessage =
    'ALREADY DEPARTED — our records show you have already voted. If you believe this is a ' +
    'mistake, please speak to the returning officer before you leave.';
  constructor(readonly votedAt: string | null) {
    super('Voter has already cast a ballot');
  }
}

export class BallotInvalidError extends AppError {
  override readonly name = 'BallotInvalidError';
  readonly code = 'BALLOT_INVALID';
  readonly httpStatus = 422;
  readonly userMessage =
    'Your ballot could not be accepted because it does not match the positions you are ' +
    'eligible to vote in. Nothing has been recorded. Please review your selections.';
  constructor(readonly issues: readonly BallotIssue[]) {
    super(`Ballot rejected: ${issues.map((i) => i.code).join(', ')}`);
  }
}

export class ElectionNotOpenError extends AppError {
  override readonly name = 'ElectionNotOpenError';
  readonly httpStatus = 409;
  readonly code: 'ELECTION_NOT_STARTED' | 'ELECTION_CLOSED';
  readonly userMessage: string;

  constructor(reason: 'NOT_STARTED' | 'CLOSED' | 'DRAFT', at?: string) {
    super(`Election not open: ${reason}`);
    if (reason === 'NOT_STARTED') {
      this.code = 'ELECTION_NOT_STARTED';
      this.userMessage = at
        ? `BOARDING NOT OPEN — voting opens at ${at}.`
        : 'BOARDING NOT OPEN — voting has not started yet.';
    } else {
      this.code = 'ELECTION_CLOSED';
      this.userMessage = at
        ? `GATE CLOSED — voting closed at ${at}. Your vote can no longer be accepted.`
        : 'GATE CLOSED — voting is closed. Your vote can no longer be accepted.';
    }
  }
}

export class IdempotencyConflictError extends AppError {
  override readonly name = 'IdempotencyConflictError';
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly httpStatus = 409;
  readonly userMessage =
    'This submission could not be processed because it conflicts with an earlier one. ' +
    'Nothing has been recorded. Please start again from the review screen.';
  constructor(reason: string) {
    super(`Idempotency conflict: ${reason}`);
  }
}

export class UnauthorizedError extends AppError {
  override readonly name = 'UnauthorizedError';
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;
  readonly userMessage = 'Your check-in has expired. Please check in again to vote.';
  constructor(reason = 'no valid session') {
    super(reason);
  }
}

export class ForbiddenError extends AppError {
  override readonly name = 'ForbiddenError';
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
  readonly userMessage = 'You do not have access to this.';
  constructor(reason = 'forbidden') {
    super(reason);
  }
}

export class RateLimitedError extends AppError {
  override readonly name = 'RateLimitedError';
  readonly code = 'RATE_LIMITED';
  readonly httpStatus = 429;
  readonly userMessage = 'Too many attempts. Please wait a moment and try again.';
  constructor(readonly retryAfterSeconds: number) {
    super(`Rate limited for ${retryAfterSeconds}s`);
  }
}
