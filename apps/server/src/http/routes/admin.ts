import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { createRateLimiter } from '../rateLimit.js';
import { checkSignIn, issueSessionToken } from '../../services/adminAuth.js';
import { requireAdmin } from '../middleware.js';

/**
 * Admin surface.
 *
 * No admin route is reachable with a voter session, and results are never
 * exposed to voters at all. The endpoints here are the service boundary a
 * future admin dashboard would consume — the dashboard itself is out of scope
 * for this release (docs/product-spec.md §6).
 */
export function adminRoutes(ctx: AppContext): Router {
  const router = Router();

  /**
   * Sign in to the election desk.
   *
   * Mounted BEFORE requireAdmin — it is how you get a credential, so it cannot
   * ask for one. Rated far harder than the rest of the API: this is the only
   * endpoint in the system where guessing repeatedly is worth anything, and
   * the desk is signed into a handful of times a day, not a handful of times
   * a minute.
   */
  router.post(
    '/session',
    createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
    (req, res) => {
      const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
      const credentials =
        ctx.env.MONITOR_EMAIL && ctx.env.MONITOR_PASSWORD_HASH
          ? { email: ctx.env.MONITOR_EMAIL, passwordHash: ctx.env.MONITOR_PASSWORD_HASH }
          : undefined;

      if (!checkSignIn(credentials, email ?? '', password ?? '')) {
        ctx.audit.append({
          event: 'ADMIN_SIGN_IN',
          actorType: 'admin',
          // The address attempted is not recorded: a failed sign-in log that
          // fills with addresses is a second place the roll leaks from.
          metadata: { outcome: 'denied' },
        });
        // One message for a wrong address and a wrong password alike.
        res.status(401).json({ error: 'Those details were not accepted.' });
        return;
      }

      ctx.audit.append({
        event: 'ADMIN_SIGN_IN',
        actorType: 'admin',
        metadata: { outcome: 'allowed' },
      });
      res.json({
        token: issueSessionToken(ctx.env.ADMIN_API_TOKEN, ctx.env.MONITOR_SESSION_HOURS * 3_600_000),
        expiresInHours: ctx.env.MONITOR_SESSION_HOURS,
      });
    },
  );

  router.use(requireAdmin(ctx));

  router.get('/results', (_req, res) => {
    res.json(ctx.results.calculate());
  });

  router.post('/results/publish', (_req, res) => {
    const results = ctx.results.calculate();
    ctx.results.publishToSpreadsheet(results);
    res.status(202).json({
      queued: true,
      positions: results.positions.length,
      note: 'Queued to the outbox. The sync worker writes it to the workbook; poll /sync/status.',
    });
  });

  router.get('/results.csv', (_req, res) => {
    const results = ctx.results.calculate();
    const rows = ctx.results.toSpreadsheetRows(results);
    const headers = Object.keys(rows[0] ?? { position: '' });
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => escape((row as unknown as Record<string, unknown>)[h])).join(','),
      ),
    ].join('\n');

    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="mesa-results.csv"`);
    res.send(csv);
  });

  router.get('/turnout', (_req, res) => {
    res.json(ctx.results.turnout());
  });

  /**
   * The invigilator's live view of the room.
   *
   * Who has voted, who has not, and the running turnout — so the people running
   * the election can tick names off and chase the stragglers without touching
   * the booth. Contains the roll (names and emails), so it is admin-gated like
   * everything else here.
   *
   * Deliberately says nothing about HOW anyone voted. There is no query that
   * could, and this endpoint is not an exception.
   */
  router.get('/monitor', (_req, res) => {
    const voters = ctx.repo.listVoters(ctx.config.election.id);
    const houses = new Map(ctx.config.houses.map((h) => [h.id, h.name]));

    const byHouse: Record<
      string,
      {
        name: string;
        color: string;
        shape: string;
        crestUrl: string | null;
        eligible: number;
        voted: number;
      }
    > = {};
    for (const house of ctx.config.houses) {
      byHouse[house.id] = {
        name: house.name,
        color: house.color,
        shape: house.shape ?? 'square',
        crestUrl: house.crestUrl ?? null,
        eligible: 0,
        voted: 0,
      };
    }
    for (const voter of voters) {
      if (!voter.houseId) continue;
      const bucket = byHouse[voter.houseId];
      if (!bucket) continue;
      bucket.eligible += 1;
      if (voter.hasVoted) bucket.voted += 1;
    }

    res.json({
      election: {
        name: ctx.config.election.name,
        status: ctx.config.election.status,
        isSeedData: ctx.config.election.isSeedData === true,
      },
      authMode: ctx.identity.mode,
      spreadsheet: {
        mode: ctx.excel.mode,
        /** Whether the count publishes itself, or waits to be published. */
        auto: ctx.env.RESULTS_PUBLISH_ENABLED,
      },
      generatedAt: new Date().toISOString(),
      turnout: ctx.results.turnout(),
      byHouse,
      voters: voters.map((voter) => ({
        id: voter.id,
        name: voter.name,
        email: voter.email,
        type: voter.type,
        house: voter.houseId ? (houses.get(voter.houseId) ?? voter.houseId) : null,
        hasVoted: voter.hasVoted,
        votedAt: voter.votedAt,
      })),
    });
  });

  /**
   * Take the election back to a clean roll. Destroys every ballot.
   *
   * Guarded by a phrase, not by a flag: the body must carry the election's own
   * name, typed out. A stray POST, a replayed request, a curl from history —
   * none of them wipe an election, because none of them happen to contain it.
   * The same phrase is what the desk makes somebody type.
   */
  router.post('/reset', async (req, res, next) => {
    const { confirm, clearSpreadsheet } = (req.body ?? {}) as {
      confirm?: string;
      clearSpreadsheet?: boolean;
    };
    try {
      const summary = await ctx.reset.run(confirm ?? '', {
        ...(clearSpreadsheet === undefined ? {} : { clearSpreadsheet }),
      });
      ctx.publisher.restart();
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 1000);
    const event = typeof req.query.event === 'string' ? req.query.event : undefined;
    res.json({ entries: ctx.audit.list(limit, event) });
  });

  router.get('/audit/verify', (_req, res) => {
    res.json(ctx.audit.verify());
  });

  router.get('/sync/status', async (_req, res) => {
    res.json({ outbox: ctx.outbox.status(), excel: await ctx.excel.health() });
  });

  router.get('/sync/failed', (_req, res) => {
    res.json({ rows: ctx.outbox.listFailed() });
  });

  router.post('/sync/retry', async (_req, res) => {
    const requeued = ctx.outbox.retryFailed();
    const summary = await ctx.sync.runOnce();
    res.json({ requeued, ...summary });
  });

  return router;
}
