import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIn,
  createHarness,
  EMPLOYEE_BALLOT,
  startServer,
  STUDENT_BALLOT,
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

describe('casting a ballot', () => {
  it('records a complete student ballot', async () => {
    const token = await checkIn(server, 'stu-1');
    const { status, body } = await submitBallot(server, token, STUDENT_BALLOT);

    expect(status).toBe(201);
    expect(body.status).toBe('recorded');
    expect(body.receiptId).toBeTruthy();
    expect(harness.ctx.repo.findVoterById('stu-1')?.hasVoted).toBe(true);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(1);
  });

  it('records an employee ballot with no house selection', async () => {
    const token = await checkIn(server, 'emp-1');
    const { status } = await submitBallot(server, token, EMPLOYEE_BALLOT);
    expect(status).toBe(201);
  });

  it('never stores a link between the voter and the ballot', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    // The strongest possible assertion: no column anywhere in the ballot tables
    // can hold a voter reference, so the query cannot even be written.
    const ballotColumns = harness.ctx.db
      .prepare('SELECT name FROM pragma_table_info(?)')
      .all('ballots') as { name: string }[];
    const selectionColumns = harness.ctx.db
      .prepare('SELECT name FROM pragma_table_info(?)')
      .all('ballot_selections') as { name: string }[];

    const names = [...ballotColumns, ...selectionColumns].map((c) => c.name);
    expect(names).not.toContain('voter_id');
    expect(names.some((n) => n.includes('voter') && n !== 'voter_type')).toBe(false);
  });

  it('coarsens the ballot timestamp to the hour', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const row = harness.ctx.db.prepare('SELECT submitted_hour FROM ballots').get() as {
      submitted_hour: string;
    };
    expect(row.submitted_hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/);
  });
});

describe('one person, one vote', () => {
  it('rejects a second ballot from the same voter', async () => {
    const first = await checkIn(server, 'stu-1');
    expect((await submitBallot(server, first, STUDENT_BALLOT)).status).toBe(201);

    // A fresh check-in: the voter has a brand new, valid session.
    const second = await checkIn(server, 'stu-1');
    const result = await submitBallot(server, second, STUDENT_BALLOT);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('ALREADY_VOTED');
    expect(result.body.error.message).toMatch(/already voted/i);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(1);
  });

  it('revokes the session as soon as a ballot is recorded', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const reuse = await submitBallot(server, token, STUDENT_BALLOT);
    expect(reuse.status).toBe(401);
  });

  it('records an audit entry for a duplicate attempt', async () => {
    const t1 = await checkIn(server, 'stu-1');
    await submitBallot(server, t1, STUDENT_BALLOT);
    const t2 = await checkIn(server, 'stu-1');
    await submitBallot(server, t2, STUDENT_BALLOT);

    const events = (harness.ctx.audit.list(50) as { event: string }[]).map((e) => e.event);
    expect(events).toContain('DUPLICATE_VOTE_ATTEMPT');
  });

  it('keeps the vote_receipts primary key as an independent guarantee', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() =>
      harness.ctx.db
        .prepare('INSERT INTO vote_receipts (voter_id, election_id, receipt_id, created_at) VALUES (?, ?, ?, ?)')
        .run('stu-1', 'test-election', 'another-receipt', new Date().toISOString()),
    ).toThrow(/UNIQUE|PRIMARY KEY/i);
  });
});

describe('server-side ballot validation', () => {
  it('rejects an incomplete ballot and records nothing', async () => {
    const token = await checkIn(server, 'stu-1');
    const { status, body } = await submitBallot(server, token, { president: 'p1' });

    expect(status).toBe(422);
    expect(body.error.code).toBe('BALLOT_INVALID');
    expect(body.error.details.issues.map((i: any) => i.code)).toContain('MISSING_SELECTION');
    expect(harness.ctx.repo.countBallots('test-election')).toBe(0);
    expect(harness.ctx.repo.findVoterById('stu-1')?.hasVoted).toBe(false);
  });

  it('rejects an employee ballot containing a house captain selection — whole, not trimmed', async () => {
    const token = await checkIn(server, 'emp-1');
    const { status, body } = await submitBallot(server, token, {
      ...EMPLOYEE_BALLOT,
      'house-captain-aravalli': 'a1',
    });

    expect(status).toBe(422);
    expect(body.error.details.issues.map((i: any) => i.code)).toContain('INELIGIBLE_POSITION');
    // The valid leadership selections are NOT quietly kept.
    expect(harness.ctx.repo.countBallots('test-election')).toBe(0);
  });

  it("rejects a student voting in another house's contest", async () => {
    const token = await checkIn(server, 'stu-1');
    const { status } = await submitBallot(server, token, {
      ...STUDENT_BALLOT,
      'house-captain-nilgiri': 'n1',
    });
    expect(status).toBe(422);
  });

  it('rejects a student ballot missing their house captain', async () => {
    const token = await checkIn(server, 'stu-1');
    const { status, body } = await submitBallot(server, token, EMPLOYEE_BALLOT);
    expect(status).toBe(422);
    expect(body.error.details.issues[0].positionId).toBe('house-captain-aravalli');
  });

  it('rejects a withdrawn candidate', async () => {
    const token = await checkIn(server, 'stu-1');
    const { status, body } = await submitBallot(server, token, {
      ...STUDENT_BALLOT,
      president: 'p3',
    });
    expect(status).toBe(422);
    expect(body.error.details.issues.map((i: any) => i.code)).toContain('INACTIVE_CANDIDATE');
  });

  it('rejects an unknown candidate id', async () => {
    const token = await checkIn(server, 'stu-1');
    const { status } = await submitBallot(server, token, { ...STUDENT_BALLOT, president: 'nope' });
    expect(status).toBe(422);
  });

  it('writes an audit entry for a rejected ballot without the selections', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, { president: 'p1' });

    const entries = harness.ctx.audit.list(50) as { event: string; metadata: string | null }[];
    const rejection = entries.find((e) => e.event === 'BALLOT_REJECTED');
    expect(rejection).toBeDefined();
    expect(rejection?.metadata).toContain('MISSING_SELECTION');
    expect(rejection?.metadata).not.toContain('p1');
  });
});

describe('the election window', () => {
  it('refuses ballots before the election opens', async () => {
    const closed = createHarness({
      config: { election: { status: 'open', opensAt: '2099-01-01T00:00:00Z' } },
    });
    const s = await startServer(closed);
    try {
      const token = await checkIn(s, 'emp-1');
      const { status, body } = await submitBallot(s, token, EMPLOYEE_BALLOT);
      expect(status).toBe(409);
      expect(body.error.code).toBe('ELECTION_NOT_STARTED');
      expect(body.error.message).toMatch(/BOARDING NOT OPEN/);
    } finally {
      await s.close();
      closed.dispose();
    }
  });

  it('refuses ballots after the election closes', async () => {
    const closed = createHarness({ config: { election: { status: 'closed' } } });
    const s = await startServer(closed);
    try {
      const token = await checkIn(s, 'emp-1');
      const { status, body } = await submitBallot(s, token, EMPLOYEE_BALLOT);
      expect(status).toBe(409);
      expect(body.error.code).toBe('ELECTION_CLOSED');
      expect(body.error.message).toMatch(/GATE CLOSED/);
    } finally {
      await s.close();
      closed.dispose();
    }
  });
});
