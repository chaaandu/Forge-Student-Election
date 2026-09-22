import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIn,
  createHarness,
  startServer,
  STUDENT_BALLOT,
  submitBallot,
  TEST_ADMIN_TOKEN,
  type TestHarness,
  type TestServer,
} from './helpers.js';

let harness: TestHarness;
let server: TestServer;

const NAME = 'Test Election';

const reset = (body: unknown) =>
  fetch(`${server.url}/api/admin/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    body: JSON.stringify(body),
  });

const count = (sql: string) => (harness.ctx.db.prepare(sql).get() as { n: number }).n;
const ballots = () => count('SELECT COUNT(*) n FROM ballots');
const voted = () => count('SELECT COUNT(*) n FROM voters WHERE has_voted = 1');

beforeEach(async () => {
  harness = createHarness();
  server = await startServer(harness);
  await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('resetting the election', () => {
  it('needs the election name typed back, exactly', async () => {
    for (const confirm of ['', 'yes', 'test election', `${NAME} `.repeat(2)]) {
      const response = await reset({ confirm });
      expect(response.status).toBe(400);
    }
    // Nothing touched by any of those attempts.
    expect(ballots()).toBe(1);
    expect(voted()).toBe(1);
  });

  it('is not reachable without an admin credential', async () => {
    const response = await fetch(`${server.url}/api/admin/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: NAME }),
    });
    expect(response.status).toBe(403);
    expect(ballots()).toBe(1);
  });

  it('destroys every ballot and puts the roll back', async () => {
    const response = await reset({ confirm: NAME });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ballotsDestroyed: 1, votersRestored: 5 });

    expect(ballots()).toBe(0);
    expect(count('SELECT COUNT(*) n FROM ballot_selections')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM vote_receipts')).toBe(0);
    expect(voted()).toBe(0);
    expect(count('SELECT COUNT(*) n FROM voters')).toBe(5);
  });

  it('lets the voter who had already voted vote again', async () => {
    await reset({ confirm: NAME });

    const token = await checkIn(server, 'stu-1');
    const second = await submitBallot(server, token, STUDENT_BALLOT);
    expect(second.status).toBe(201);
    expect(ballots()).toBe(1);
  });

  it('restores the immutability guards it had to drop', async () => {
    await reset({ confirm: NAME });
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);

    // The triggers live on the tables, so dropping the tables drops them too.
    // If they were not rebuilt, the whole one-vote guarantee would be gone and
    // nothing else in the suite would notice.
    expect(() => harness.ctx.db.exec('DELETE FROM ballots')).toThrow(/immutable/);
    expect(() => harness.ctx.db.exec('UPDATE voters SET has_voted = 0')).toThrow(
      /cannot be withdrawn/,
    );
  });

  it('keeps the audit log, and records the reset in it', async () => {
    const before = harness.ctx.audit.list(500).length;
    await reset({ confirm: NAME });

    const entries = harness.ctx.audit.list(500);
    // Kept, not wiped: a count that vanished must be provably a reset rather
    // than ballots going missing.
    expect(entries.length).toBeGreaterThan(before);
    expect(entries.some((e) => e.event === 'BALLOT_SUBMITTED')).toBe(true);

    const record = entries.find((e) => e.event === 'ELECTION_RESET') as
      | { metadata: string }
      | undefined;
    expect(record).toBeDefined();
    // How many ballots a reset destroyed is the one number worth keeping: it
    // is what makes "the count went to zero" answerable afterwards.
    expect(JSON.parse(record?.metadata ?? '{}')).toMatchObject({
      ballotsDestroyed: 1,
      votersRestored: 5,
    });

    // And the chain still verifies across it.
    expect(harness.ctx.audit.verify()).toMatchObject({ valid: true });
  });

  it('clears the spreadsheet before it touches the database', async () => {
    let cleared = false;
    const failing = createHarness({
      excel: {
        mode: 'spool' as const,
        appendVoterParticipation: async () => {},
        appendBallotSelections: async () => {},
        upsertCandidates: async () => {},
        appendResults: async () => {},
        clearElectionData: async () => {
          cleared = true;
          throw new Error('Google is unreachable');
        },
        health: async () => ({ ok: true, mode: 'spool', detail: '' }),
      },
    });
    const failingServer = await startServer(failing);
    try {
      await submitBallot(failingServer, await checkIn(failingServer, 'stu-1'), STUDENT_BALLOT);

      const response = await fetch(`${failingServer.url}/api/admin/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ confirm: NAME }),
      });

      expect(cleared).toBe(true);
      expect(response.status).toBe(500);
      // The authoritative copy survives a mirror that would not clear. The
      // other ordering leaves the sheet holding ballots the database does not.
      expect(
        (failing.ctx.db.prepare('SELECT COUNT(*) n FROM ballots').get() as { n: number }).n,
      ).toBe(1);
    } finally {
      await failingServer.close();
      failing.dispose();
    }
  });

  it('can be told to leave the spreadsheet alone', async () => {
    const response = await reset({ confirm: NAME, clearSpreadsheet: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ spreadsheetCleared: false });
    expect(ballots()).toBe(0);
  });
});
