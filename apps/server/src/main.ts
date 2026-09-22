import { createContext } from './context.js';
import { createApp } from './http/app.js';
import { fileURLToPath } from 'node:url';

function start(): void {
  let ctx;
  try {
    ctx = createContext();
  } catch (error) {
    // A misconfigured election that boots is worse than one that does not.
    console.error(`\n${(error as Error).message}\n`);
    process.exit(1);
  }

  const app = createApp(ctx, {
    staticDir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  });

  if (ctx.env.SYNC_ENABLED) ctx.sync.start();
  if (ctx.env.RESULTS_PUBLISH_ENABLED) ctx.publisher.start();

  const server = app.listen(ctx.env.PORT, () => {
    console.log(
      `\n  Mesa Elections API\n` +
        `  ─────────────────────────────────────────────\n` +
        `  election      ${ctx.config.election.name} (${ctx.config.election.status})\n` +
        `  config        ${ctx.configVersion}\n` +
        `  auth mode     ${ctx.identity.mode}\n` +
        (ctx.identity.requiresSupervision
          ? `                ⚠  Voters select their own name. Identity rests on the\n` +
            `                   invigilator in the room, not on this software.\n` +
            `                   One-vote enforcement is unaffected.\n`
          : '') +
        (ctx.config.election.isSeedData
          ? `  ⚠  DEMO DATA   these are not real candidates or real voters\n`
          : '') +
        `  excel mode    ${ctx.excel.mode}\n` +
        `  results       ${
          ctx.env.RESULTS_PUBLISH_ENABLED
            ? `publish to the sheet automatically, every ${
                ctx.env.RESULTS_PUBLISH_INTERVAL_MS / 1000
              }s if the count moved`
            : 'published by hand — npm run results:publish'
        }\n` +
        `  voters        ${ctx.voters.length}\n` +
        `  listening     http://localhost:${ctx.env.PORT}\n`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — draining.`);
    ctx.sync.stop();
    ctx.publisher.stop();
    server.close(() => {
      ctx.db.close();
      process.exit(0);
    });
    // The database is the only thing that must be clean; do not hang forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
