import { Router } from 'express';
import type { AppContext } from '../../context.js';
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
  router.use(requireAdmin(ctx));

  router.get('/results', (_req, res) => {
    res.json(ctx.results.calculate());
  });

  router.post('/results/publish', (_req, res) => {
    const results = ctx.results.calculate();
    ctx.results.publishToExcel(results);
    res.status(202).json({
      queued: true,
      positions: results.positions.length,
      note: 'Queued to the outbox. The sync worker writes it to the workbook; poll /sync/status.',
    });
  });

  router.get('/results.csv', (_req, res) => {
    const results = ctx.results.calculate();
    const rows = ctx.results.toExcelRows(results);
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
