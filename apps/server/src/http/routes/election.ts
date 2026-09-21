import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { electionWindow, publicElection } from '../../election/configStore.js';

export function electionRoutes(ctx: AppContext): Router {
  const router = Router();

  /**
   * Everything the client needs to render the whole ballot, fetched once.
   *
   * Contains no voters and no inactive candidates. Delivering it in one call is
   * what lets the voter move between gates with no network round-trip.
   */
  router.get('/', (_req, res) => {
    const window = electionWindow(ctx.config);
    res.json({
      ...publicElection(ctx.config),
      window,
      auth: {
        mode: ctx.identity.mode,
        supportsRollSearch: ctx.identity.supportsRollSearch,
        requiresSupervision: ctx.identity.requiresSupervision,
      },
      configVersion: ctx.configVersion,
    });
  });

  return router;
}
