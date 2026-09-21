import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIn,
  createHarness,
  startServer,
  STUDENT_BALLOT,
  submitBallot,
  TEST_KIOSK_TOKEN,
  type TestHarness,
  type TestServer,
} from './helpers.js';

let harness: TestHarness;
let server: TestServer;

beforeEach(async () => {
  harness = createHarness({
    voters: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `stu-${i + 1}`,
        name: `Student ${i + 1}`,
        email: `stu${i + 1}@seed.invalid`,
        type: 'student',
        houseId: 'aravalli',
      })),
      { id: 'emp-1', name: 'Employee One', email: 'emp1@seed.invalid', type: 'employee' },
    ],
  });
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

/**
 * The shared-kiosk case.
 *
 * Every voter in a hall arrives from the same IP address. Rate limits keyed on
 * the address would throttle the queue — the election's own users — which is a
 * far more likely failure than the abuse the limit is meant to stop.
 */
describe('a queue of voters sharing one kiosk address', () => {
  it('lets twelve different voters cast ballots back to back', async () => {
    const statuses: number[] = [];

    for (let i = 1; i <= 12; i += 1) {
      const token = await checkIn(server, `stu-${i}`);
      const result = await submitBallot(server, token, STUDENT_BALLOT);
      statuses.push(result.status);
    }

    expect(statuses.every((s) => s === 201)).toBe(true);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(12);
  });

  it('lets many voters search the roll without throttling the queue', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const response = await fetch(`${server.url}/api/auth/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-kiosk-token': TEST_KIOSK_TOKEN },
        body: JSON.stringify({ query: 'Student' }),
      });
      statuses.push(response.status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('still bounds one voter hammering the submit endpoint', async () => {
    const token = await checkIn(server, 'emp-1');
    // First attempt is invalid so the session survives for the rest.
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const result = await submitBallot(server, token, { president: 'p1' });
      codes.push(result.status);
    }

    expect(codes).toContain(429);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(0);
  });

  it('returns Retry-After so a client knows how long to wait', async () => {
    const token = await checkIn(server, 'emp-1');
    let retryAfter: string | null = null;

    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(`${server.url}/api/ballots`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'idempotency-key': crypto.randomUUID(),
        },
        // Deliberately invalid: a valid ballot revokes the session on the first
        // call, so the limiter would never be reached.
        body: JSON.stringify({ selections: { president: 'p1' } }),
      });
      if (response.status === 429) {
        retryAfter = response.headers.get('retry-after');
        break;
      }
    }

    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
