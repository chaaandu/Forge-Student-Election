import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, STUDENT_BALLOT, type TestHarness } from './helpers.js';

const WORKER = fileURLToPath(new URL('./concurrencyWorker.ts', import.meta.url));
const TSX = fileURLToPath(new URL('../../../../node_modules/.bin/tsx', import.meta.url));

let harness: TestHarness;

beforeEach(() => {
  harness = createHarness();
  // Release the test process's handle so the spawned processes contend only
  // with each other, exactly as separate API instances would.
  harness.ctx.db.close();
});

afterEach(() => {
  harness.dispose();
});

function runWorker(voterId: string, startAt: number): Promise<{ outcome: string; code?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      TSX,
      [
        WORKER,
        join(harness.dir, 'election.config.json'),
        join(harness.dir, 'voters.json'),
        harness.dbPath,
        voterId,
        String(startAt),
        JSON.stringify(STUDENT_BALLOT),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += String(chunk)));
    child.stderr.on('data', (chunk) => (err += String(chunk)));
    child.on('close', () => {
      try {
        resolve(JSON.parse(out.trim().split('\n').pop() ?? '{}'));
      } catch {
        reject(new Error(`worker produced no result.\nstdout: ${out}\nstderr: ${err}`));
      }
    });
  });
}

describe('concurrent submissions for the same voter', () => {
  it('records exactly one ballot when 8 processes submit simultaneously', async () => {
    const startAt = Date.now() + 1200; // enough for every process to boot and line up
    const results = await Promise.all(
      Array.from({ length: 8 }, () => runWorker('stu-1', startAt)),
    );

    const recorded = results.filter((r) => r.outcome === 'recorded');
    const rejected = results.filter((r) => r.outcome === 'rejected');

    expect(recorded).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    // Every loser must lose for the right reason — not a lock timeout or a crash.
    expect(rejected.every((r) => r.code === 'ALREADY_VOTED')).toBe(true);

    // And the database agrees.
    const { openDatabase } = await import('../db/index.js');
    const db = openDatabase(harness.dbPath);
    const ballots = db.prepare('SELECT COUNT(*) AS n FROM ballots').get() as { n: number };
    const receipts = db.prepare('SELECT COUNT(*) AS n FROM vote_receipts').get() as { n: number };
    const selections = db.prepare('SELECT COUNT(*) AS n FROM ballot_selections').get() as {
      n: number;
    };
    const voter = db.prepare('SELECT has_voted FROM voters WHERE id = ?').get('stu-1') as {
      has_voted: number;
    };
    db.close();

    expect(ballots.n).toBe(1);
    expect(receipts.n).toBe(1);
    expect(selections.n).toBe(Object.keys(STUDENT_BALLOT).length);
    expect(voter.has_voted).toBe(1);
  }, 45_000);

  it('lets different voters submit concurrently without interfering', async () => {
    const startAt = Date.now() + 1200;
    const results = await Promise.all([
      runWorker('stu-1', startAt),
      runWorker('stu-3', startAt),
    ]);

    expect(results.filter((r) => r.outcome === 'recorded')).toHaveLength(2);

    const { openDatabase } = await import('../db/index.js');
    const db = openDatabase(harness.dbPath);
    const ballots = db.prepare('SELECT COUNT(*) AS n FROM ballots').get() as { n: number };
    db.close();
    expect(ballots.n).toBe(2);
  }, 45_000);
});
