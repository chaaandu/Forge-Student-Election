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

interface WorkerHandle {
  ready: Promise<void>;
  result: Promise<{ outcome: string; code?: string }>;
  release(): void;
}

function startWorker(voterId: string): WorkerHandle {
  const child = spawn(
    TSX,
    [
      WORKER,
      join(harness.dir, 'election.config.json'),
      join(harness.dir, 'voters.json'),
      harness.dbPath,
      voterId,
      JSON.stringify(STUDENT_BALLOT),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let out = '';
  let err = '';
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });

  const result = new Promise<{ outcome: string; code?: string }>((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
      if (out.includes('READY')) signalReady();
    });
    child.stderr.on('data', (chunk) => (err += String(chunk)));
    child.on('close', () => {
      const lines = out.trim().split('\n').filter((l) => l !== 'READY');
      try {
        resolve(JSON.parse(lines.pop() ?? '{}'));
      } catch {
        reject(new Error(`worker produced no result.\nstdout: ${out}\nstderr: ${err}`));
      }
    });
    child.on('error', reject);
  });

  return {
    ready,
    result,
    release: () => child.stdin.write('GO\n'),
  };
}

/**
 * Boot N workers, wait until every one is at the barrier, then release them all
 * in the same tick. No timing guesses: every transaction starts together.
 */
async function raceWorkers(voterIds: string[]): Promise<{ outcome: string; code?: string }[]> {
  const workers = voterIds.map(startWorker);
  await Promise.all(workers.map((w) => w.ready));
  for (const worker of workers) worker.release();
  return Promise.all(workers.map((w) => w.result));
}

describe('concurrent submissions for the same voter', () => {
  it('records exactly one ballot when 8 processes submit simultaneously', async () => {
    const results = await raceWorkers(Array.from({ length: 8 }, () => 'stu-1'));

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
    const results = await raceWorkers(['stu-1', 'stu-3']);

    expect(results.filter((r) => r.outcome === 'recorded')).toHaveLength(2);

    const { openDatabase } = await import('../db/index.js');
    const db = openDatabase(harness.dbPath);
    const ballots = db.prepare('SELECT COUNT(*) AS n FROM ballots').get() as { n: number };
    db.close();
    expect(ballots.n).toBe(2);
  }, 45_000);
});
