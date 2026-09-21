import { Router } from 'express';
import { z } from 'zod';
import { buildSteps } from '@mesa/election-core';
import type { AppContext } from '../../context.js';
import { UnauthorizedError } from '../../services/errors.js';
import { requireSession } from '../middleware.js';
import { createRateLimiter } from '../rateLimit.js';

/**
 * The submission schema.
 *
 * Note what is absent: there is no `voterId` and no `voterType`. They are not
 * validated-then-ignored, they are simply not part of the contract — a forged
 * value has nowhere to land. Identity comes from the session.
 */
const submitSchema = z.object({
  selections: z.record(z.string().min(1).max(64), z.string().min(1).max(64)),
});

export function ballotRoutes(ctx: AppContext): Router {
  const router = Router();
  // Keyed on the VOTER, not the IP. Every voter at a shared kiosk shares an
  // address, so an IP-keyed limit here would mean the sixth person in the queue
  // simply cannot vote. A voter gets one ballot anyway; this only bounds
  // repeated attempts by the same person.
  const submitLimit = createRateLimiter({
    limit: 8,
    windowMs: 60_000,
    keyOf: (req) => `ballot:${req.voter?.id ?? req.ip}`,
  });

  router.get('/session', requireSession(ctx), (req, res) => {
    const voter = req.voter!;
    const steps = buildSteps(ctx.config, voter);
    res.json({
      voter: {
        id: voter.id,
        name: voter.name,
        email: voter.email,
        type: voter.type,
        houseId: voter.houseId ?? null,
        hasVoted: voter.hasVoted,
        eligiblePositionIds: steps.map((s) => s.id),
      },
      window: ctx.config.election.status,
    });
  });

  router.post('/session/end', requireSession(ctx), (req, res) => {
    ctx.sessions.revoke(req.sessionId!);
    res.json({ ended: true });
  });

  router.post('/ballots', requireSession(ctx), submitLimit, (req, res) => {
    const voter = req.voter!;

    const idempotencyKey = req.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      res.status(400).json({
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message:
            'This submission is missing its one-time key, so it was not processed. ' +
            'Nothing has been recorded. Please try again from the review screen.',
        },
      });
      return;
    }

    // Deliberately no `if (voter.hasVoted)` short-circuit here. The service
    // re-reads the voter under the write lock, rejects, and audits the attempt;
    // a fast path in the route would return the same answer while skipping the
    // audit entry, which is the part that matters.
    const { selections } = submitSchema.parse(req.body);

    const result = ctx.voting.submitBallot({
      voter,
      sessionId: req.sessionId!,
      selections,
      idempotencyKey,
    });

    // A session buys exactly one ballot.
    ctx.sessions.revoke(req.sessionId!);

    res.status(result.replayed ? 200 : 201).json(result);
  });

  return router;
}

export function requireSessionOrThrow(): never {
  throw new UnauthorizedError();
}
