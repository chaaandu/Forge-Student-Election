import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ConfigValidationError } from '@mesa/election-core';
import { AppError, BallotInvalidError, RateLimitedError } from '../services/errors.js';

export interface ErrorBody {
  error: {
    code: string;
    /** Always plain language first. Themed wording lives in the client. */
    message: string;
    details?: unknown;
  };
}

/**
 * The single place an error becomes a response.
 *
 * Two rules: every response carries a stable machine `code` the client can
 * branch on, and every `message` is something a voter can act on. There is no
 * bare "Something went wrong" anywhere in this system.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof RateLimitedError) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
    res.status(error.httpStatus).json({
      error: { code: error.code, message: error.userMessage },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof BallotInvalidError) {
    res.status(error.httpStatus).json({
      error: {
        code: error.code,
        message: error.userMessage,
        details: {
          issues: error.issues.map((i) => ({
            code: i.code,
            positionId: i.positionId,
            message: i.message,
          })),
        },
      },
    } satisfies ErrorBody);
    return;
  }

  // body-parser failures: a request that never became JSON at all.
  const parserType = (error as { type?: string } | null)?.type;
  if (parserType === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message:
          'That request was too large to process and was not accepted. Nothing has been ' +
          'recorded. If you were casting a vote, please start again from the review screen.',
      },
    } satisfies ErrorBody);
    return;
  }
  if (parserType === 'entity.parse.failed' || error instanceof SyntaxError) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_REQUEST',
        message:
          'That request could not be read and was not processed. Nothing has been recorded. ' +
          'Please try again.',
      },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message:
          'That request was not in the expected shape and was not processed. Nothing has ' +
          'been recorded.',
        details: {
          fields: error.issues.map((i) => ({
            path: i.path.join('.') || '(root)',
            message: i.message,
          })),
        },
      },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.httpStatus).json({
      error: { code: error.code, message: error.userMessage },
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof ConfigValidationError) {
    res.status(500).json({
      error: {
        code: 'ELECTION_DATA_UNAVAILABLE',
        message:
          'The election configuration on this server is not valid, so voting cannot proceed. ' +
          'Please tell the returning officer — this needs fixing before anyone can vote.',
      },
    } satisfies ErrorBody);
    return;
  }

  // Unexpected. Log the detail server-side; tell the voter what it means for
  // them and what to do, which is the part they actually need.
  console.error('[unhandled]', req.method, req.path, error);
  res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message:
        'Something failed on our side and your request was not completed. Nothing has been ' +
        'recorded. Please try again — and tell the returning officer if it keeps happening.',
    },
  } satisfies ErrorBody);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' },
  } satisfies ErrorBody);
}
