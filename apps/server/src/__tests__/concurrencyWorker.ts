/**
 * One process, one ballot attempt.
 *
 * Spawned N times by concurrency.test.ts so that N *real* OS processes contend
 * for the same SQLite file at the same instant. Testing this in-process would
 * prove nothing: better-sqlite3 is synchronous, so a single-threaded test can
 * never actually interleave two transactions.
 */
import { readSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { createContext } from '../context.js';

const [, , configPath, rollPath, dbPath, voterId, selectionsRaw] = process.argv;

const env = loadEnv({
  NODE_ENV: 'test',
  AUTH_MODE: 'supervised',
  SPREADSHEET_MODE: 'spool',
  SYNC_ENABLED: 'false',
  ELECTION_CONFIG_PATH: configPath,
  VOTER_ROLL_PATH: rollPath,
  DATABASE_PATH: dbPath,
  EXCEL_SPOOL_DIR: `${dbPath}-spool`,
  HASH_SALT: 'test-hash-salt-0123456789abcdef',
  KIOSK_TOKEN: 'test-kiosk-token-0123456789abcdef',
  ADMIN_API_TOKEN: 'test-admin-token-0123456789abcdef',
} as NodeJS.ProcessEnv);

const ctx = createContext({ env, skipVoterSync: true });
const voter = ctx.repo.findVoterById(String(voterId));
if (!voter) {
  process.stdout.write(JSON.stringify({ outcome: 'error', reason: 'voter not found' }));
  process.exit(0);
}

/**
 * Barrier: announce readiness, then block until the parent releases everyone.
 *
 * An earlier version waited for a wall-clock instant agreed up front. That is a
 * guess about how long N processes take to boot, and under load (a full
 * `npm run verify`, with tsc and vite running alongside) the guess can expire
 * before the slowest process is ready — which both weakens the race and makes
 * the test flaky. A real barrier is deterministic and collides harder.
 */
process.stdout.write('READY\n');
{
  const buffer = Buffer.alloc(16);
  // Blocking read: returns only when the parent writes the release byte.
  try {
    readSync(0, buffer, 0, buffer.length, null);
  } catch {
    // stdin closed — proceed anyway rather than hanging the suite.
  }
}

try {
  const result = ctx.voting.submitBallot({
    voter,
    sessionId: `concurrent-${process.pid}`,
    selections: JSON.parse(String(selectionsRaw)),
    // A DIFFERENT key per process: this must be stopped by the one-vote rule
    // itself, not by idempotency.
    idempotencyKey: `concurrent-${process.pid}-${Math.random().toString(36).slice(2)}`,
  });
  process.stdout.write(JSON.stringify({ outcome: 'recorded', receiptId: result.receiptId }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ outcome: 'rejected', code: (error as { code?: string }).code ?? 'UNKNOWN' }),
  );
} finally {
  ctx.db.close();
}
