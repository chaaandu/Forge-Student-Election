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
    expect(html).toContain('Election desk');
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

  it('resolves every element its script reaches for', async () => {
    // The same class of bug that froze the ballot sheet: a null from
    // getElementById throws on first property access. Here it would blank the
    // screen someone is running the room from.
    const { JSDOM } = await import('jsdom');
    const page = await (await fetch(`${server.url}/monitor`)).text();

    const script = page.slice(page.indexOf('<script>') + 8, page.lastIndexOf('</script>'));
    const dom = new JSDOM(page.replace(/<script[\s\S]*?<\/script>/g, '')).window.document;

    const ids = new Set([
      ...[...script.matchAll(/getElementById\(['"]([\w-]+)['"]\)/g)].map((m) => m[1]!),
      ...[...script.matchAll(/\$\(['"]([\w-]+)['"]\)/g)].map((m) => m[1]!),
    ]);

    expect(ids.size).toBeGreaterThan(10);
    for (const id of ids) {
      expect(dom.getElementById(id), `#${id} is referenced but does not exist`).not.toBeNull();
    }
  });

  it('uses the width instead of a narrow column', async () => {
    const page = await (await fetch(`${server.url}/monitor`)).text();
    // Turnout and houses beside the roll, not stacked down a 900px strip.
    expect(page).toMatch(/\.cols\s*\{[^}]*grid-template-columns/);
    expect(page).toContain('max-width:1360px');
  });

  it('keeps the summary column in view while the roll is scrolled', async () => {
    const page = await (await fetch(`${server.url}/monitor`)).text();
    const side = page.match(/\.side\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(page, 'the summary column is not marked as the sticky one').toContain('class="side"');
    expect(side).toMatch(/position:\s*sticky/);

    // Without this the column stretches to the row height, so it is already as
    // tall as the list it should stick within and simply never moves. It is the
    // whole mechanism, and it fails silently, so it is pinned here.
    expect(side, 'sticky without align-self:start does nothing in a grid').toMatch(
      /align-self:\s*start/,
    );

    // A sticky element taller than the viewport hides its own bottom; four
    // houses is enough to reach that on a laptop.
    expect(side).toMatch(/max-height:\s*calc\(100vh/);
    expect(side).toMatch(/overflow:\s*auto/);

    // Not on a phone-width screen, where the layout is a single column and
    // sticking the summary would pin it on top of the roll.
    expect(page).toMatch(/@media\s*\(min-width:\s*941px\)\s*\{\s*\.side/);
  });

  it('offers the count as a second tab rather than a second page', async () => {
    const page = await (await fetch(`${server.url}/monitor`)).text();
    expect(page).toContain('role="tablist"');
    expect(page).toContain('aria-controls="paneRoom"');
    expect(page).toContain('aria-controls="paneResults"');
  });

  it('flags a practice run so nobody mistakes it for the real thing', async () => {
    const body = await (await monitor()).json();
    expect(body.election).toHaveProperty('isSeedData');
    expect(body.authMode).toBe('supervised');
  });
});

describe('the reset control', () => {
  it('keeps the destructive button dead until the name is typed out', async () => {
    const { JSDOM } = await import('jsdom');
    const page = await (await fetch(`${server.url}/monitor`)).text();

    const dom = new JSDOM(page, {
      url: `${server.url}/monitor`,
      runScripts: 'dangerously',
      beforeParse(window) {
        window.sessionStorage.setItem('mesa.monitor.token', TEST_ADMIN_TOKEN);
        (window as unknown as { fetch: typeof fetch }).fetch = ((
          input: string,
          init?: RequestInit,
        ) => fetch(new URL(input, server.url).toString(), init)) as typeof fetch;
      },
    });

    const document = dom.window.document;
    try {
      // The election's own name is the phrase, so wait for the payload that
      // carries it rather than for markup that ships with a placeholder.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (document.getElementById('title')?.textContent === 'Test Election') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(document.getElementById('resetCount')?.textContent).toBe('0 ballots');

      // Folded away until asked for: this destroys every ballot and the page it
      // lives on is open on a desk all day.
      expect(document.getElementById('resetForm')?.hasAttribute('hidden')).toBe(true);
      (document.getElementById('resetOpen') as HTMLElement).click();
      expect(document.getElementById('resetForm')?.hasAttribute('hidden')).toBe(false);

      const go = document.getElementById('resetGo') as HTMLButtonElement;
      const phrase = document.getElementById('resetPhrase') as HTMLInputElement;
      expect(go.disabled).toBe(true);

      const type = (value: string) => {
        phrase.value = value;
        phrase.dispatchEvent(new dom.window.Event('input'));
      };

      type('Test');
      expect(go.disabled).toBe(true);
      type('test election'); // right words, wrong case
      expect(go.disabled).toBe(true);
      type('Test Election');
      expect(go.disabled).toBe(false);
    } finally {
      dom.window.close();
    }
  });
});

/**
 * The results tab, driven for real.
 *
 * The page is rendered in jsdom with its own script running and `fetch`
 * pointed at the live test server, so these assert what an invigilator
 * actually sees rather than what the source looks like.
 */
describe('the results tab', () => {
  async function openResults() {
    const { JSDOM } = await import('jsdom');
    const page = await (await fetch(`${server.url}/monitor`)).text();

    const dom = new JSDOM(page, {
      url: `${server.url}/monitor#results`,
      runScripts: 'dangerously',
      beforeParse(window) {
        window.sessionStorage.setItem('mesa.monitor.token', TEST_ADMIN_TOKEN);
        // Straight through to the server under test: the dashboard is only
        // worth asserting against the payloads it will really be given.
        (window as unknown as { fetch: typeof fetch }).fetch = ((
          input: string,
          init?: RequestInit,
        ) => fetch(new URL(input, server.url).toString(), init)) as typeof fetch;
      },
    });

    const document = dom.window.document;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (document.querySelectorAll('#contests .contest').length > 0) return { dom, document };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    dom.window.close();
    throw new Error('the results tab never rendered a contest');
  }

  const rowFor = (document: Document, title: string) =>
    [...document.querySelectorAll('#contests .contest')].find(
      (row) => row.querySelector('.contest__pos')?.textContent?.trim() === title,
    );

  it('is one line per contest, and nothing else', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const { dom, document } = await openResults();
    try {
      // Four in the harness election: two leadership, two house captain. One
      // line each — the whole answer, with no second rendering of the same ten
      // facts underneath it.
      expect(document.querySelectorAll('#contests .contest')).toHaveLength(4);
      expect(document.getElementById('paneResults')?.hasAttribute('hidden')).toBe(false);
      expect(document.getElementById('paneRoom')?.hasAttribute('hidden')).toBe(true);

      const president = rowFor(document, 'President');
      expect(president?.textContent).toContain('Alpha President');
      expect(president?.textContent).toContain('100%');
      // Closed by default: the detail is a click away, not on screen.
      expect(president?.querySelector('.contest__open')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('opens one contest at a time, and closes the last one', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const { dom, document } = await openResults();
    try {
      (rowFor(document, 'President')?.querySelector('.contest__row') as HTMLElement).click();
      expect(rowFor(document, 'President')?.querySelector('.contest__open')).not.toBeNull();
      // Every candidate, and where each one's votes came from, in words.
      expect(rowFor(document, 'President')?.textContent).toContain('Beta President');
      expect(rowFor(document, 'President')?.textContent).toContain('1 of 1 student');

      (rowFor(document, 'Vice President')?.querySelector('.contest__row') as HTMLElement).click();
      expect(document.querySelectorAll('.contest__open')).toHaveLength(1);
      expect(rowFor(document, 'Vice President')?.querySelector('.contest__open')).not.toBeNull();

      (rowFor(document, 'Vice President')?.querySelector('.contest__row') as HTMLElement).click();
      expect(document.querySelectorAll('.contest__open')).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  });

  it('draws a house contest in its own house colour and every other in ink', async () => {
    await submitBallot(server, await checkIn(server, 'stu-1'), STUDENT_BALLOT);
    // stu-2 is in the other house: without a vote there, that contest is
    // silent and draws no bar at all, which is a different assertion.
    await submitBallot(server, await checkIn(server, 'stu-2'), {
      president: 'p1',
      'vice-president': 'v1',
      'house-captain-nilgiri': 'n1',
    });

    const { dom, document } = await openResults();
    try {
      const meterOf = (title: string) =>
        (rowFor(document, title)?.querySelector('.contest__meter i') as HTMLElement | null)?.style
          .background ?? '';

      // Aravalli's colour in the harness config, as rgb() once jsdom has parsed it.
      expect(meterOf('Aravalli House Captain')).toBe('rgb(222, 43, 31)');
      expect(meterOf('Nilgiri House Captain')).toBe('rgb(27, 77, 155)');
      expect(meterOf('President')).toBe('rgb(20, 20, 20)');
      expect(meterOf('Vice President')).toBe('rgb(20, 20, 20)');
    } finally {
      dom.window.close();
    }
  });

  it('says a contest has no votes rather than showing a winner on nothing', async () => {
    const { dom, document } = await openResults();
    try {
      const president = rowFor(document, 'President');
      expect(president?.textContent).toContain('No votes yet');
      expect(president?.querySelector('.contest__pct')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('never asks the count for the roll: results poll far slower than the room', async () => {
    // Every calculation is an audited event. A four-second poll on this tab
    // would bury the audit log under the act of watching it.
    const page = await (await fetch(`${server.url}/monitor`)).text();
    const roomInterval = Number(page.match(/setInterval\(load, (\d+)\)/)?.[1]);
    const resultsInterval = Number(
      page.match(/setInterval\(function \(\) \{ loadResults\(true\); \}, (\d+)\)/)?.[1],
    );

    expect(roomInterval).toBeGreaterThan(0);
    expect(resultsInterval).toBeGreaterThanOrEqual(roomInterval * 4);
  });
});
