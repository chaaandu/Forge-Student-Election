import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppContext } from '../context.js';
import { errorHandler, notFoundHandler } from './errorHandler.js';
import { createRateLimiter } from './rateLimit.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { ballotRoutes } from './routes/ballots.js';
import { electionRoutes } from './routes/election.js';

const MONITOR_PAGE = fileURLToPath(new URL('./monitor.html', import.meta.url));

export interface AppOptions {
  /** Directory of the built SPA. Serving it here makes the deployment same-origin. */
  readonly staticDir?: string;
}

export function createApp(ctx: AppContext, options: AppOptions = {}): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // No results, no roll, no ballot is ever cacheable.
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Same-origin in production (the SPA is served from here), so CORS is only
  // needed for the Vite dev server.
  if (ctx.env.NODE_ENV !== 'production') {
    const allowed = ctx.env.DEV_CORS_ORIGIN.split(',').map((o) => o.trim());
    app.use((req, res, next) => {
      const origin = req.get('origin');
      if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,idempotency-key,x-kiosk-token');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  // A ballot is a few hundred bytes. Anything larger is a mistake or an attack.
  app.use(express.json({ limit: '16kb' }));
  // Sized for a shared kiosk, not a single user: an election hall is one NAT
  // address with a queue of voters behind it, so a tight per-IP limit would
  // throttle legitimate voting. This ceiling exists to stop a runaway client
  // loop, not to police individuals — per-voter limits do that (see below).
  app.use(createRateLimiter({ limit: 600, windowMs: 60_000 }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      election: ctx.config.election.id,
      configVersion: ctx.configVersion,
      authMode: ctx.identity.mode,
    });
  });

  /**
   * The invigilator's monitor.
   *
   * Served by the API rather than the voting SPA, so it is unreachable from a
   * booth by navigating the voter flow. The page itself is public; every byte
   * of data it renders comes from /api/admin/monitor, which requires the admin
   * token.
   */
  app.get('/monitor', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(MONITOR_PAGE);
  });

  app.use('/api/election', electionRoutes(ctx));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api', ballotRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));

  const staticDir = options.staticDir ? resolve(options.staticDir) : undefined;
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(resolve(staticDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
