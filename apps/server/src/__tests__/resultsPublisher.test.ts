import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ResultsPublisher } from '../services/resultsPublisher.js';
import {
  checkIn,
  createHarness,
  startServer,
  STUDENT_BALLOT,
  submitBallot,
  type TestHarness,
  type TestServer,
} from './helpers.js';

let harness: TestHarness;
let server: TestServer;
let publisher: ResultsPublisher;

/** Snapshots queued to the outbox, newest last. */
const snapshots = () =>
  harness.ctx.db
    .prepare(`SELECT id FROM outbox WHERE kind = 'results_snapshot' ORDER BY id`)
    .all() as { id: number }[];

beforeEach(async () => {
  harness = createHarness();
  server = await startServer(harness);
  publisher = new ResultsPublisher(
    harness.ctx.db,
    harness.ctx.repo,
    harness.ctx.results,
    harness.ctx.config.election.id,
    { intervalMs: 60_000 },
  );
});

afterEach(async () => {
  publisher.stop();
  await server.close();
  harness.dispose();
});

describe('publishing the count on its own', () => {
  it('publishes nothing at all before a single ballot is cast', () => {
    expect(publisher.runOnce()).toMatchObject({ published: false, reason: 'no-ballots' });
    expect(snapshots()).toHaveLength(0);
  });

  it('publishes once the first ballot arrives', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);

    expect(publisher.runOnce()).toMatchObject({ published: true, ballots: 1 });
    expect(snapshots()).toHaveLength(1);
  });

  it('does not publish the same count twice', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
    publisher.runOnce();

    // A polling day is hundreds of ticks. Re-publishing an unchanged count on
    // each one would bury the newest result under thousands of identical rows.
    expect(publisher.runOnce()).toMatchObject({ published: false, reason: 'unchanged' });
    expect(publisher.runOnce()).toMatchObject({ published: false, reason: 'unchanged' });
    expect(snapshots()).toHaveLength(1);
  });

  it('publishes again as soon as the count moves', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
    publisher.runOnce();

    await submitBallot(server, await checkIn(server, 'stu-2'), {
      president: 'p1',
      'vice-president': 'v1',
      'house-captain-nilgiri': 'n1',
    });

    expect(publisher.runOnce()).toMatchObject({ published: true, ballots: 2 });
    expect(snapshots()).toHaveLength(2);
  });

  it('does not repeat a count across a restart', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
    publisher.runOnce();

    // A fresh instance is what a deploy, a crash loop or a watch-mode reload
    // produces. The marker lives in the database, so none of them appends
    // another copy of a count that has not moved.
    const restarted = new ResultsPublisher(
      harness.ctx.db,
      harness.ctx.repo,
      harness.ctx.results,
      harness.ctx.config.election.id,
      { intervalMs: 60_000 },
    );
    expect(restarted.runOnce()).toMatchObject({ published: false, reason: 'unchanged' });
    expect(snapshots()).toHaveLength(1);
  });

  it('goes through the same outbox as every vote, never straight to Google', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
    publisher.runOnce();

    const row = harness.ctx.db
      .prepare(`SELECT kind, status FROM outbox WHERE kind = 'results_snapshot'`)
      .get() as { kind: string; status: string };

    // A downstream mirror behind a queue: a Google outage delays the snapshot
    // and can never lose it, exactly as for a ballot.
    expect(row).toMatchObject({ kind: 'results_snapshot', status: 'pending' });
  });
});
