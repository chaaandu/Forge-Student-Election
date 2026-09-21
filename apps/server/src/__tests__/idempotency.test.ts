import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIn,
  createHarness,
  EMPLOYEE_BALLOT,
  startServer,
  submitBallot,
  type TestHarness,
  type TestServer,
} from './helpers.js';

let harness: TestHarness;
let server: TestServer;

beforeEach(async () => {
  harness = createHarness();
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('idempotent submission', () => {
  it('replays the original result for a repeated key instead of double voting', async () => {
    const token = await checkIn(server, 'emp-1');
    const key = crypto.randomUUID();

    const first = await submitBallot(server, token, EMPLOYEE_BALLOT, key);
    expect(first.status).toBe(201);
    expect(first.body.replayed).toBe(false);

    // The client retries after a timeout: same key, same body, same session.
    // (The session is revoked after a ballot, so a real retry uses the service
    // directly the way the route would before revocation.)
    const replay = harness.ctx.voting.submitBallot({
      voter: harness.ctx.repo.findVoterById('emp-1')!,
      sessionId: 'retry',
      selections: EMPLOYEE_BALLOT,
      idempotencyKey: key,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.receiptId).toBe(first.body.receiptId);
    expect(replay.submittedAt).toBe(first.body.submittedAt);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(1);
  });

  it('records an audit entry for a replay', async () => {
    const token = await checkIn(server, 'emp-1');
    const key = crypto.randomUUID();
    await submitBallot(server, token, EMPLOYEE_BALLOT, key);

    harness.ctx.voting.submitBallot({
      voter: harness.ctx.repo.findVoterById('emp-1')!,
      sessionId: 'retry',
      selections: EMPLOYEE_BALLOT,
      idempotencyKey: key,
    });

    const events = (harness.ctx.audit.list(50) as { event: string }[]).map((e) => e.event);
    expect(events).toContain('IDEMPOTENT_REPLAY');
  });

  it('rejects a key reused with different selections', async () => {
    const token = await checkIn(server, 'emp-1');
    const key = crypto.randomUUID();
    await submitBallot(server, token, EMPLOYEE_BALLOT, key);

    expect(() =>
      harness.ctx.voting.submitBallot({
        voter: harness.ctx.repo.findVoterById('emp-1')!,
        sessionId: 'retry',
        selections: { president: 'p2', 'vice-president': 'v2' },
        idempotencyKey: key,
      }),
    ).toThrow(/different selections/);
  });

  it('rejects a key reused by a different voter', async () => {
    const token = await checkIn(server, 'emp-1');
    const key = crypto.randomUUID();
    await submitBallot(server, token, EMPLOYEE_BALLOT, key);

    const other = await checkIn(server, 'emp-2');
    const result = await submitBallot(server, other, EMPLOYEE_BALLOT, key);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(harness.ctx.repo.findVoterById('emp-2')?.hasVoted).toBe(false);
  });

  it('treats a NEW key from a voter who has already voted as a duplicate vote', async () => {
    // This is the important distinction: idempotency de-duplicates retries, it
    // is not what enforces one-vote. A fresh key must still be refused.
    const token = await checkIn(server, 'emp-1');
    await submitBallot(server, token, EMPLOYEE_BALLOT, crypto.randomUUID());

    const again = await checkIn(server, 'emp-1');
    const result = await submitBallot(server, again, EMPLOYEE_BALLOT, crypto.randomUUID());

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('ALREADY_VOTED');
    expect(harness.ctx.repo.countBallots('test-election')).toBe(1);
  });

  it('hashes selections order-independently so key reuse is judged on content', async () => {
    const token = await checkIn(server, 'emp-1');
    const key = crypto.randomUUID();
    await submitBallot(server, token, { president: 'p1', 'vice-president': 'v1' }, key);

    const reordered = harness.ctx.voting.submitBallot({
      voter: harness.ctx.repo.findVoterById('emp-1')!,
      sessionId: 'retry',
      selections: { 'vice-president': 'v1', president: 'p1' },
      idempotencyKey: key,
    });
    expect(reordered.replayed).toBe(true);
  });
});
