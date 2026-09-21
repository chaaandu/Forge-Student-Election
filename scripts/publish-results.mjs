#!/usr/bin/env node
/**
 * Push a fresh results snapshot to the spreadsheet.
 *
 *   npm run results:publish
 *
 * Calls the admin endpoint, which recalculates from the ballots and queues a
 * snapshot through the same outbox the votes use. Safe to run as often as you
 * like: each run appends a timestamped snapshot rather than overwriting, so
 * earlier counts stay auditable and the Dashboard always shows the newest.
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: 'apps/server/.env' });
loadDotenv();

const base = process.env.RESULTS_API_BASE ?? `http://localhost:${process.env.PORT ?? 8787}`;
const token = process.env.ADMIN_API_TOKEN;

if (!token) {
  console.error('\n✗ ADMIN_API_TOKEN is not set in apps/server/.env\n');
  process.exit(1);
}

const headers = { authorization: `Bearer ${token}` };

let res;
try {
  res = await fetch(`${base}/api/admin/results/publish`, { method: 'POST', headers });
} catch {
  console.error(`\n✗ Could not reach the election server at ${base}.\n  Is it running?\n`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`\n✗ ${res.status} — ${await res.text()}\n`);
  process.exit(1);
}

const queued = await res.json();
console.log(`\n  Queued a snapshot of ${queued.positions} positions.`);

// The outbox drains on a timer; wait briefly and report where it got to.
await new Promise((r) => setTimeout(r, 6000));
const status = await (await fetch(`${base}/api/admin/sync/status`, { headers })).json();

console.log(`  Outbox: ${JSON.stringify(status.outbox)}`);
console.log(`  Sheet : ${status.excel.ok ? 'reachable' : 'NOT REACHABLE'} — ${status.excel.detail}\n`);

if (status.outbox.failed > 0) {
  console.log('  Some rows failed. See what and why:');
  console.log(`    curl -s ${base}/api/admin/sync/failed -H "authorization: Bearer <ADMIN_API_TOKEN>"`);
  console.log('  Fix the cause, then retry them:  npm run sheets:retry\n');
}
