/**
 * One process, one ballot attempt.
 *
 * Spawned N times by concurrency.test.ts so that N *real* OS processes contend
 * for the same SQLite file at the same instant. Testing this in-process would
 * prove nothing: better-sqlite3 is synchronous, so a single-threaded test can
 * never actually interleave two transactions.
 */
import { loadEnv } from '../config/env.js';
import { createContext } from '../context.js';

const [, , configPath, rollPath, dbPath, voterId, startAtRaw, selectionsRaw] = process.argv;

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

// Line up on a shared wall-clock instant so the transactions genuinely collide
// instead of being spread out by process start-up time.
const startAt = Number(startAtRaw);
while (Date.now() < startAt) {
  /* spin */
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
