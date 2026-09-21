import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenAuditMetadataError } from '../db/auditRepository.js';
import { checkIn, createHarness, startServer, STUDENT_BALLOT, submitBallot, type TestHarness, type TestServer } from './helpers.js';

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

describe('the audit chain', () => {
  it('verifies clean after normal activity', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const verification = harness.ctx.audit.verify();
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBeGreaterThan(2);
  });

  it('detects an edited historical entry', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    // The trigger blocks UPDATE, so tampering requires dropping it first —
    // which is exactly the scenario the hash chain exists to make detectable.
    harness.ctx.db.exec('DROP TRIGGER audit_log_no_update');
    harness.ctx.db.prepare('UPDATE audit_log SET event = ? WHERE seq = 2').run('NOTHING_HAPPENED');

    const verification = harness.ctx.audit.verify();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtSeq).toBe(2);
    expect(verification.reason).toMatch(/edited/);
  });

  it('detects a removed entry', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    harness.ctx.db.exec('DROP TRIGGER audit_log_no_delete');
    harness.ctx.db.prepare('DELETE FROM audit_log WHERE seq = 2').run();

    const verification = harness.ctx.audit.verify();
    expect(verification.valid).toBe(false);
    expect(verification.reason).toMatch(/removed or reordered/);
  });

  it('refuses to write ballot selections into the log', () => {
    expect(() =>
      harness.ctx.audit.append({
        event: 'BALLOT_SUBMITTED',
        actorType: 'voter',
        actorId: 'stu-1',
        metadata: { selections: { president: 'p1' } },
      }),
    ).toThrow(ForbiddenAuditMetadataError);
  });

  it('refuses to write a token or a code into the log', () => {
    for (const key of ['token', 'accessCode', 'secret']) {
      expect(() =>
        harness.ctx.audit.append({
          event: 'IDENTITY_VERIFIED',
          actorType: 'voter',
          metadata: { [key]: 'value' },
        }),
      ).toThrow(ForbiddenAuditMetadataError);
    }
  });

  it('never contains a candidate id anywhere after a full ballot', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const all = JSON.stringify(harness.ctx.audit.list(500));
    for (const candidateId of Object.values(STUDENT_BALLOT)) {
      expect(all).not.toContain(`"${candidateId}"`);
    }
  });

  it('does not put the ballot id in the same entry as the voter id', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const ballot = harness.ctx.db.prepare('SELECT id FROM ballots').get() as { id: string };
    const submitted = (harness.ctx.audit.list(50) as { event: string; metadata: string | null }[])
      .filter((e) => e.event === 'BALLOT_SUBMITTED');

    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.metadata ?? '').not.toContain(ballot.id);
  });
});

describe('immutability triggers', () => {
  it('refuses to update a ballot', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() =>
      harness.ctx.db.prepare("UPDATE ballots SET voter_type = 'employee'").run(),
    ).toThrow(/immutable/);
  });

  it('refuses to delete a ballot or its selections', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() => harness.ctx.db.prepare('DELETE FROM ballots').run()).toThrow(/immutable/);
    expect(() => harness.ctx.db.prepare('DELETE FROM ballot_selections').run()).toThrow(/immutable/);
  });

  it('refuses to change a recorded selection', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() =>
      harness.ctx.db.prepare("UPDATE ballot_selections SET candidate_id = 'p2'").run(),
    ).toThrow(/immutable/);
  });

  it('refuses to un-vote a voter', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() =>
      harness.ctx.db.prepare('UPDATE voters SET has_voted = 0 WHERE id = ?').run('stu-1'),
    ).toThrow(/cannot be withdrawn/);
  });

  it('refuses to delete a vote receipt', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    expect(() => harness.ctx.db.prepare('DELETE FROM vote_receipts').run()).toThrow(/immutable/);
  });
});
