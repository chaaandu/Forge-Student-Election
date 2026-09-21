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

  const server = app.listen(ctx.env.PORT, () => {
    console.log(
      `\n  Mesa Elections API\n` +
        `  ─────────────────────────────────────────────\n` +
        `  election      ${ctx.config.election.name} (${ctx.config.election.status})\n` +
        `  config        ${ctx.configVersion}\n` +
        `  auth mode     ${ctx.identity.mode}${ctx.identity.mode === 'dev' ? '  ⚠  NO IDENTITY VERIFICATION' : ''}\n` +
        `  excel mode    ${ctx.excel.mode}\n` +
        `  voters        ${ctx.voters.length}\n` +
        `  listening     http://localhost:${ctx.env.PORT}\n`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — draining.`);
    ctx.sync.stop();
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
