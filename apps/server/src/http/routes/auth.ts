import { Router } from 'express';
import { z } from 'zod';
import { buildSteps } from '@mesa/election-core';
import type { AppContext } from '../../context.js';
import { AccessCodeProvider, DevIdentityProvider, EntraIdentityProvider } from '../../identity/index.js';
import { ForbiddenError, UnauthorizedError } from '../../services/errors.js';
import { newId } from '../../lib/crypto.js';
import { bindingOf, maskEmail, requireKioskToken } from '../middleware.js';
import { createRateLimiter } from '../rateLimit.js';

const lookupSchema = z.object({ query: z.string().min(2).max(80) });
const verifySchema = z.object({ voterId: z.string().min(1).max(64), code: z.string().min(1).max(32) });
const devSchema = z.object({ voterId: z.string().min(1).max(64) });
const exchangeSchema = z.object({ code: z.string().min(1).max(128) });

const HANDOFF_TTL_MS = 120_000;

/** The voter payload the client is allowed to see about itself. */
function voterProfile(ctx: AppContext, voter: { id: string; name: string; email: string; type: 'student' | 'employee'; houseId?: string; hasVoted: boolean }) {
  const steps = buildSteps(ctx.config, voter);
  return {
    id: voter.id,
    name: voter.name,
    email: voter.email,
    type: voter.type,
    houseId: voter.houseId ?? null,
    hasVoted: voter.hasVoted,
    /** The voter's OWN sequence. An employee gets six; a student gets seven. */
    eligiblePositionIds: steps.map((s) => s.id),
  };
}

export function authRoutes(ctx: AppContext): Router {
  const router = Router();

  // Type-ahead fires as a voter types, and a whole queue shares one kiosk
  // address, so this is generous. The roll is protected by the kiosk token, the
  // two-character minimum and the eight-result cap — not by this limit.
  const lookupLimit = createRateLimiter({ limit: 120, windowMs: 60_000 });

  // Keyed on the VOTER, deliberately not on the IP. On a shared kiosk an
  // IP-keyed limit would let one person's five wrong codes lock out everyone
  // queued behind them. Brute force is bounded per voter by this limit and by
  // the per-voter lockout in AccessCodeProvider; the global per-IP ceiling in
  // app.ts still catches a flood.
  const verifyLimit = createRateLimiter({
    limit: 8,
    windowMs: 15 * 60_000,
    keyOf: (req) => `verify:${String((req.body as { voterId?: string })?.voterId ?? req.ip)}`,
  });

  router.get('/mode', (_req, res) => {
    res.json({
      mode: ctx.identity.mode,
      supportsRollSearch: ctx.identity.supportsRollSearch,
      isDevelopmentMode: ctx.identity.mode === 'dev',
    });
  });

  /**
   * Type-ahead over the voter roll.
   *
   * Gated by the kiosk token, minimum two characters, hard cap of eight
   * results, emails masked. This is a lookup aid, not a directory export.
   */
  router.post('/lookup', requireKioskToken(ctx), lookupLimit, (req, res) => {
    if (!ctx.identity.supportsRollSearch) {
      throw new ForbiddenError('roll search is disabled when signing in with a Mesa account');
    }
    const { query } = lookupSchema.parse(req.body);
    const matches = ctx.repo.searchVoters(query, ctx.config.election.id);

    res.json({
      results: matches.map((voter) => ({
        id: voter.id,
        name: voter.name,
        maskedEmail: maskEmail(voter.email),
        type: voter.type,
        houseId: voter.houseId ?? null,
        hasVoted: voter.hasVoted,
      })),
      truncated: matches.length >= 8,
    });
  });

  /** Access-code verification. */
  router.post('/verify', requireKioskToken(ctx), verifyLimit, (req, res) => {
    if (!(ctx.identity instanceof AccessCodeProvider)) {
      throw new ForbiddenError('this election is not using access codes');
    }
    const { voterId, code } = verifySchema.parse(req.body);
    const outcome = ctx.identity.verify(voterId, code);

    if (!outcome.ok) {
      ctx.audit.append({
        event: outcome.code === 'LOCKED_OUT' ? 'ACCESS_CODE_LOCKED' : 'IDENTITY_FAILED',
        actorType: 'voter',
        subjectId: voterId,
        metadata: { reason: outcome.code },
      });
      res.status(outcome.code === 'LOCKED_OUT' ? 429 : 401).json({
        error: {
          code: outcome.code,
          message: outcome.message,
          details: {
            ...(outcome.attemptsRemaining !== undefined
              ? { attemptsRemaining: outcome.attemptsRemaining }
              : {}),
            ...(outcome.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: outcome.retryAfterSeconds }
              : {}),
          },
        },
      });
      return;
    }

    res.json(issueSession(ctx, outcome.voter, req));
  });

  /** Development only: identify with no proof. */
  router.post('/dev', requireKioskToken(ctx), lookupLimit, (req, res) => {
    if (!(ctx.identity instanceof DevIdentityProvider)) {
      throw new ForbiddenError('development sign-in is not enabled');
    }
    const { voterId } = devSchema.parse(req.body);
    const outcome = ctx.identity.identify(voterId);
    if (!outcome.ok) {
      res.status(404).json({ error: { code: outcome.code, message: outcome.message } });
      return;
    }
    res.json(issueSession(ctx, outcome.voter, req));
  });

  // ------------------------------------------------------------- entra ---

  router.get('/entra/start', (_req, res) => {
    if (!(ctx.identity instanceof EntraIdentityProvider)) {
      throw new ForbiddenError('Mesa account sign-in is not enabled');
    }
    const { url } = ctx.identity.beginLogin();
    res.redirect(url);
  });

  router.get('/entra/callback', async (req, res, next) => {
    try {
      if (!(ctx.identity instanceof EntraIdentityProvider)) {
        throw new ForbiddenError('Mesa account sign-in is not enabled');
      }
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) {
        res.redirect('/?checkin_error=PROVIDER_ERROR');
        return;
      }

      const outcome = await ctx.identity.completeLogin(code, state);
      if (!outcome.ok) {
        ctx.audit.append({
          event: outcome.code === 'NOT_ON_ROLL' ? 'VOTER_NOT_ON_ROLL' : 'IDENTITY_FAILED',
          actorType: 'voter',
          metadata: { reason: outcome.code },
        });
        res.redirect(`/?checkin_error=${encodeURIComponent(outcome.code)}`);
        return;
      }

      // The session token is never placed in a URL. The SPA exchanges this
      // one-time, short-lived code for it over POST.
      const handoff = newId();
      const now = new Date();
      ctx.db
        .prepare(
          'INSERT INTO handoff_codes (code, voter_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        )
        .run(
          handoff,
          outcome.voter.id,
          now.toISOString(),
          new Date(now.getTime() + HANDOFF_TTL_MS).toISOString(),
        );

      res.redirect(`/?checkin=${encodeURIComponent(handoff)}`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/entra/exchange', lookupLimit, (req, res) => {
    const { code } = exchangeSchema.parse(req.body);
    const now = new Date();

    const row = ctx.db.prepare('SELECT * FROM handoff_codes WHERE code = ?').get(code) as
      | { code: string; voter_id: string; expires_at: string; consumed_at: string | null }
      | undefined;

    if (!row || row.consumed_at !== null || new Date(row.expires_at) < now) {
      throw new UnauthorizedError('handoff code expired or already used');
    }
    ctx.db
      .prepare('UPDATE handoff_codes SET consumed_at = ? WHERE code = ?')
      .run(now.toISOString(), code);

    const voter = ctx.repo.findVoterById(row.voter_id);
    if (!voter) throw new UnauthorizedError('voter no longer on the roll');

    res.json(issueSession(ctx, voter, req));
  });

  return router;
}

function issueSession(
  ctx: AppContext,
  voter: Parameters<typeof voterProfile>[1],
  req: Parameters<typeof bindingOf>[0],
) {
  const session = ctx.sessions.issue(voter.id, bindingOf(req));
  ctx.audit.append({
    event: 'IDENTITY_VERIFIED',
    actorType: 'voter',
    actorId: voter.id,
    metadata: { mode: ctx.identity.mode, hasVoted: voter.hasVoted },
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    voter: voterProfile(ctx, voter),
  };
}
