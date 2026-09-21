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

const monitor = (token = TEST_ADMIN_TOKEN) =>
  fetch(`${server.url}/api/admin/monitor`, { headers: { authorization: `Bearer ${token}` } });

beforeEach(async () => {
  harness = createHarness();
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('the invigilator monitor', () => {
  it('serves the page without a token but returns no data without one', async () => {
    const page = await fetch(`${server.url}/monitor`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Invigilator');
    expect(html).toContain('Admin token');

    // The page is public; the data behind it is not.
    expect((await fetch(`${server.url}/api/admin/monitor`)).status).toBe(403);
  });

  it('is not reachable with a voter session', async () => {
    const token = await checkIn(server, 'stu-1');
    expect((await monitor(token)).status).toBe(403);
  });

  it('lists who has voted and who has not', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const body = await (await monitor()).json();
    const voted = body.voters.find((v: { id: string }) => v.id === 'stu-1');
    const notYet = body.voters.find((v: { id: string }) => v.id === 'stu-2');

    expect(voted).toMatchObject({ hasVoted: true, name: 'Student One' });
    expect(voted.votedAt).toBeTruthy();
    expect(notYet).toMatchObject({ hasVoted: false, votedAt: null });
  });

  it('reports turnout overall, by type and by house', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const body = await (await monitor()).json();
    expect(body.turnout.overall).toMatchObject({ eligible: 5, voted: 1 });
    expect(body.turnout.byType.student).toMatchObject({ eligible: 3, voted: 1 });
    expect(body.byHouse.aravalli).toMatchObject({ name: 'Aravalli', eligible: 2, voted: 1 });
    expect(body.byHouse.nilgiri).toMatchObject({ eligible: 1, voted: 0 });
  });

  it('never reveals how anyone voted', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const text = await (await monitor()).text();
    // No candidate id and no ballot id may appear anywhere in this payload.
    for (const candidateId of Object.values(STUDENT_BALLOT)) {
      expect(text).not.toContain(`"${candidateId}"`);
    }
    const ballot = harness.ctx.db.prepare('SELECT id FROM ballots').get() as { id: string };
    expect(text).not.toContain(ballot.id);
  });

  it('carries each house colour AND form, so the turnout race is readable without colour', async () => {
    const body = await (await monitor()).json();
    const houses = Object.values(body.byHouse) as { name: string; color: string; shape: string }[];

    expect(houses.length).toBeGreaterThan(0);
    for (const house of houses) {
      expect(house.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(['square', 'circle', 'triangle', 'arc']).toContain(house.shape);
    }
    // Distinct forms: a colour-blind invigilator can still tell the lanes apart.
    expect(new Set(houses.map((h) => h.shape)).size).toBe(houses.length);
  });

  it('flags demo data so an invigilator cannot mistake a rehearsal for the real thing', async () => {
    const body = await (await monitor()).json();
    expect(body.election).toHaveProperty('isSeedData');
    expect(body.authMode).toBe('supervised');
  });
});
