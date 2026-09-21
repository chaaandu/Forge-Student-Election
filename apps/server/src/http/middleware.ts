import type { NextFunction, Request, Response } from 'express';
import type { AppContext } from '../context.js';
import type { VoterRecord } from '../db/electionRepository.js';
import { safeEquals } from '../lib/crypto.js';
import { ForbiddenError, UnauthorizedError } from '../services/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    voter?: VoterRecord;
    sessionId?: string;
  }
}

export function bindingOf(req: Request) {
  const userAgent = req.get('user-agent');
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

function bearer(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  return header.slice(7).trim() || undefined;
}

/**
 * Resolve the voting session.
 *
 * This is where the voter's identity enters a request — from the server's own
 * session table, never from the body. Downstream handlers read `req.voter` and
 * have no access to any client-supplied voter id.
 */
export function requireSession(ctx: AppContext) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const token = bearer(req);
    if (!token) {
      next(new UnauthorizedError('missing bearer token'));
      return;
    }

    const resolved = ctx.sessions.resolve(token, bindingOf(req));
    if (!resolved.ok) {
      if (resolved.reason === 'BINDING_MISMATCH') {
        ctx.audit.append({
          event: 'SESSION_BINDING_MISMATCH',
          actorType: 'system',
          metadata: { reason: 'session presented from a different device' },
        });
      }
      next(new UnauthorizedError(resolved.reason));
      return;
    }

    req.voter = resolved.voter;
    req.sessionId = resolved.sessionId;
    next();
  };
}

/** Gate for the roll-search endpoint: a device credential, not a user credential. */
export function requireKioskToken(ctx: AppContext) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const provided = req.get('x-kiosk-token') ?? '';
    if (!provided || !safeEquals(provided, ctx.env.KIOSK_TOKEN)) {
      next(new ForbiddenError('invalid kiosk token'));
      return;
    }
    next();
  };
}

export function requireAdmin(ctx: AppContext) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const header = req.get('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

    if (!token || !safeEquals(token, ctx.env.ADMIN_API_TOKEN)) {
      ctx.audit.append({
        event: 'ADMIN_ACCESS',
        actorType: 'admin',
        metadata: { path: req.path, outcome: 'denied' },
      });
      next(new ForbiddenError('invalid admin token'));
      return;
    }

    ctx.audit.append({
      event: 'ADMIN_ACCESS',
      actorType: 'admin',
      metadata: { path: req.path, outcome: 'allowed' },
    });
    next();
  };
}

/**
 * Mask an email for the roll-search results.
 *
 * Enough for a voter to recognise their own address, not enough to harvest the
 * directory. `chandu@mesa.edu` → `ch•••@mesa.edu`.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
