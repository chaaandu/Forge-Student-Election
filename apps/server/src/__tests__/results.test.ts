import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ElectionResults } from '@mesa/election-core';
import {
  checkIn,
  createHarness,
  startServer,
  TEST_ADMIN_TOKEN,
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

async function vote(voterId: string, selections: Record<string, string>) {
  const token = await checkIn(server, voterId);
  const result = await submitBallot(server, token, selections);
  if (result.status !== 201) throw new Error(`vote failed: ${JSON.stringify(result.body)}`);
}

const position = (results: ElectionResults, id: string) => {
  const found = results.positions.find((p) => p.positionId === id);
  if (!found) throw new Error(`no result for ${id}`);
  return found;
};

describe('end-to-end results', () => {
  it('matches a hand-computed weighted score', async () => {
    // Students: stu-1 and stu-3 (Aravalli) pick p1; stu-2 (Nilgiri) picks p2.
    // Employees: emp-1 picks p2, emp-2 picks p2.
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });
    await vote('stu-3', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });
    await vote('stu-2', { president: 'p2', 'vice-president': 'v1', 'house-captain-nilgiri': 'n1' });
    await vote('emp-1', { president: 'p2', 'vice-president': 'v2' });
    await vote('emp-2', { president: 'p2', 'vice-president': 'v2' });

    const response = await fetch(`${server.url}/api/admin/results`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const results = (await response.json()) as ElectionResults;

    const president = position(results, 'president');
    const p1 = president.candidates.find((c) => c.candidateId === 'p1')!;
    const p2 = president.candidates.find((c) => c.candidateId === 'p2')!;

    // p1: 2/3 of students, 0/2 of employees → (2/3 × .75) + 0 = 0.5
    expect(p1.finalScore).toBeCloseTo((2 / 3) * 0.75, 12);
    // p2: 1/3 of students, 2/2 of employees → (1/3 × .75) + (1 × .25) = 0.5
    expect(p2.finalScore).toBeCloseTo((1 / 3) * 0.75 + 0.25, 12);
    expect(president.weightingLabel).toBe('Weighted 75/25 (student/employee)');

    // A genuine tie at 0.5 — reported, never broken.
    expect(p1.finalScore).toBeCloseTo(p2.finalScore, 12);
    expect(president.winner).toBeNull();
    expect(p1.tied).toBe(true);
  });

  it('applies student-only weighting to house captains, uncapped', async () => {
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });
    await vote('stu-3', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });
    await vote('emp-1', { president: 'p2', 'vice-president': 'v2' });

    const response = await fetch(`${server.url}/api/admin/results`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const results = (await response.json()) as ElectionResults;
    const house = position(results, 'house-captain-aravalli');
    const a1 = house.candidates.find((c) => c.candidateId === 'a1')!;

    expect(house.weightingBasis).toBe('SINGLE_GROUP');
    expect(house.weightingLabel).toBe('Student-only (100%)');
    // Every student vote in the house → 100%, not 75%.
    expect(a1.finalScore).toBe(1);
    expect(a1.finalScorePercent).toBe(100);
    expect(a1.perType.employee).toBeUndefined();
    expect(house.winner?.candidateId).toBe('a1');
  });

  it('counts house turnout against that house only', async () => {
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });

    const response = await fetch(`${server.url}/api/admin/results`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const results = (await response.json()) as ElectionResults;

    // Two Aravalli students on the roll, one voted.
    expect(position(results, 'house-captain-aravalli').turnout).toMatchObject({
      eligibleVoters: 2,
      ballotsCast: 1,
    });
    // Five voters overall for president, one voted.
    expect(position(results, 'president').turnout).toMatchObject({
      eligibleVoters: 5,
      ballotsCast: 1,
    });
  });

  it('leaves a blank, not a zero, where a group was never eligible', async () => {
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });

    const response = await fetch(`${server.url}/api/admin/results.csv`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const csv = await response.text();
    const houseRow = csv.split('\n').find((line) => line.includes('Aravalli One'))!;

    expect(houseRow).toContain('Student-only (100%)');
    // employee_votes / employee_percentage / employee_contribution are empty:
    // "could not vote here" must not read as "got no votes".
    expect(houseRow).toContain('"","",""');
  });

  it('reports turnout by voter type', async () => {
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });
    await vote('emp-1', { president: 'p1', 'vice-president': 'v1' });

    const response = await fetch(`${server.url}/api/admin/turnout`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const turnout = await response.json();

    expect(turnout.byType.student).toMatchObject({ eligible: 3, voted: 1 });
    expect(turnout.byType.employee).toMatchObject({ eligible: 2, voted: 1 });
    expect(turnout.overall).toMatchObject({ eligible: 5, voted: 2 });
  });

  it('queues a results snapshot through the same outbox as ballots', async () => {
    await vote('stu-1', { president: 'p1', 'vice-president': 'v1', 'house-captain-aravalli': 'a1' });

    const response = await fetch(`${server.url}/api/admin/results/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    expect(response.status).toBe(202);

    await harness.ctx.sync.runOnce();
    expect(harness.ctx.outbox.status().synced).toBeGreaterThanOrEqual(3);
  });

  it('records that results were generated', async () => {
    await fetch(`${server.url}/api/admin/results`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const events = (harness.ctx.audit.list(20) as { event: string }[]).map((e) => e.event);
    expect(events).toContain('RESULTS_GENERATED');
  });

  it('produces zeroes and no winner before anyone has voted', async () => {
    const response = await fetch(`${server.url}/api/admin/results`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    const results = (await response.json()) as ElectionResults;

    for (const p of results.positions) {
      expect(p.weightingBasis).toBe('NO_VOTES');
      expect(p.winner).toBeNull();
      expect(p.candidates.every((c) => c.finalScore === 0)).toBe(true);
    }
  });
});
