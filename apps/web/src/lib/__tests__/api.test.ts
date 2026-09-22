import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, matchRoll } from '../api';

/** Vercel's own 404 body — the one that produced `Unexpected token 'T'`. */
const VERCEL_404 = '<!DOCTYPE html><html><body>The page could not be found</body></html>';

function respondWith(body: string, status = 200, contentType = 'text/html') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api request envelope', () => {
  it('turns a host that answers in HTML into an ApiError, not a SyntaxError', async () => {
    respondWith(VERCEL_404, 404);

    const error = await api.election().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect((error as ApiError).code).toBe('UPSTREAM');
    expect((error as ApiError).status).toBe(404);
  });

  it('treats an unparseable response as possibly-undelivered, so a ballot may be retried', async () => {
    respondWith('<html>502 Bad Gateway</html>', 502);

    const error = (await api
      .submitBallot('token', { president: 'c1' }, 'key-1')
      .catch((e: unknown) => e)) as ApiError;

    // The same idempotency key is safe to reuse only because this is a network
    // class failure: the server may never have seen the ballot at all.
    expect(error.isNetwork).toBe(true);
    expect(error.isRetryable).toBe(true);
  });

  it('rejects a 200 that is not JSON rather than handing the caller garbage', async () => {
    respondWith('<html>captive portal</html>', 200);

    const error = (await api.election().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('UPSTREAM');
  });

  it('still surfaces the server own error envelope', async () => {
    respondWith(
      JSON.stringify({ error: { code: 'ALREADY_VOTED', message: 'You have already voted.' } }),
      409,
      'application/json',
    );

    const error = (await api.election().catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('ALREADY_VOTED');
    expect(error.message).toBe('You have already voted.');
    expect(error.isRetryable).toBe(false);
  });

  it('accepts an empty body without trying to parse it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(api.endSession('token')).resolves.toBeNull();
  });
});

/**
 * The roll search that runs in the browser.
 *
 * This replaced a request per keystroke against Apps Script, which is the slow
 * transport described in `fetchRoll`. The ranking matters more than it looks:
 * a voter who cannot find their own name on this screen cannot vote at all.
 */
describe('matchRoll', () => {
  const roll = [
    row('v1', 'Abeer Bhati', 'ab\u2022\u2022\u2022@forge27.mesaschool.co'),
    row('v2', 'Bhavna Rao', 'bh\u2022\u2022\u2022@forge27.mesaschool.co'),
    row('v3', 'Chandra Bhat', 'ch\u2022\u2022\u2022@forge27.mesaschool.co'),
    row('v4', "Maria D'Souza", 'ma\u2022\u2022\u2022@forge27.mesaschool.co'),
    row('v5', 'Zo\u00eb Fernandes', 'zo\u2022\u2022\u2022@forge27.mesaschool.co'),
  ];

  function row(id: string, name: string, maskedEmail: string) {
    return { id, name, maskedEmail, type: 'student' as const, houseId: null, hasVoted: false };
  }

  it('puts a name that starts with the query above one that merely contains it', () => {
    const { results } = matchRoll(roll, 'bh');

    expect(results.map((r) => r.name)).toEqual(['Bhavna Rao', 'Abeer Bhati', 'Chandra Bhat']);
  });

  it('finds a person whose name is typed surname first', () => {
    expect(matchRoll(roll, 'bhati abeer').results.map((r) => r.name)).toEqual(['Abeer Bhati']);
  });

  it('ignores the punctuation and accents nobody types at a kiosk', () => {
    expect(matchRoll(roll, 'dsouza').results.map((r) => r.name)).toEqual(["Maria D'Souza"]);
    expect(matchRoll(roll, 'zoe').results.map((r) => r.name)).toEqual(['Zo\u00eb Fernandes']);
  });

  it('requires every term to match, so a wrong second word narrows to nothing', () => {
    expect(matchRoll(roll, 'abeer rao').results).toEqual([]);
  });

  /*
    The cap is applied to SORTED matches. The Apps Script version stopped
    collecting at nine in whatever order the roll was keyed and alphabetised
    those, so a matching voter could be absent from a list that was not full.
  */
  it('shows the eight best matches, not the first eight found', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(`x${i}`, `${String.fromCharCode(122 - i)}an Sharma`, 'xx\u2022\u2022\u2022@x.co'),
    );
    const { results, truncated } = matchRoll([...many], 'an');

    expect(results).toHaveLength(8);
    expect(truncated).toBe(true);
    // Every one of them ranks equally, so the eight shown are the alphabetical
    // first eight of all twenty rather than the first eight in array order.
    expect(results.map((r) => r.name)).toEqual(
      [...many].map((r) => r.name).sort().slice(0, 8),
    );
  });

  it('treats a query of only punctuation as no query at all', () => {
    expect(matchRoll(roll, "  '  ").results).toEqual([]);
  });
});

/**
 * The Apps Script search path.
 *
 * Exercised through a freshly imported module because `usingAppsScript` is
 * decided once, at load, from the environment.
 */
describe('lookup against Apps Script', () => {
  const EXEC = 'https://script.google.com/macros/s/AKfy/exec';

  async function freshApi(onFetch: (url: string) => Promise<Response>) {
    vi.stubEnv('VITE_APPS_SCRIPT_URL', EXEC);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) => onFetch(String(input))),
    );
    vi.resetModules();
    window.sessionStorage.clear();
    return import('../api');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  const ROLL = [
    { id: 'v1', name: 'Abeer Bhati', maskedEmail: 'ab•••@x.co', type: 'student', houseId: null, hasVoted: false },
  ];

  /*
    The regression this exists for: `lookup` used to `await` the roll fetch,
    which handed the first voter to type the whole of the slow fetch it was
    meant to remove.
  */
  it('answers the first query without waiting for the roll to arrive', async () => {
    let releaseRoll = () => {};
    const rollBlocked = new Promise<void>((resolve) => {
      releaseRoll = resolve;
    });

    const { api } = await freshApi(async (url) => {
      if (url.includes('action=roll')) {
        await rollBlocked; // never resolves during this assertion
        return json({ voters: ROLL });
      }
      return json({ results: [{ ...ROLL[0], name: 'From the server' }], truncated: false });
    });

    const answered = await api.lookup('ab');

    expect(answered.results[0]?.name).toBe('From the server');
    releaseRoll();
  });

  it('matches locally once the roll has landed, with no further request', async () => {
    const calls: string[] = [];
    const { api } = await freshApi(async (url) => {
      calls.push(url);
      return url.includes('action=roll')
        ? json({ voters: ROLL })
        : json({ results: [], truncated: false });
    });

    await api.primeRoll();
    const before = calls.length;

    expect((await api.lookup('abeer')).results[0]?.name).toBe('Abeer Bhati');
    expect(calls.length).toBe(before);
  });

  it('keeps the roll across a reload, so a refreshed kiosk does not wait again', async () => {
    const first = await freshApi(async () => json({ voters: ROLL }));
    await first.api.primeRoll();

    // A reload: the module is re-imported, but sessionStorage is not cleared.
    vi.stubEnv('VITE_APPS_SCRIPT_URL', EXEC);
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) => {
        calls.push(String(input));
        return Promise.resolve(json({ voters: ROLL }));
      }),
    );
    vi.resetModules();
    const { api } = await import('../api');

    expect((await api.lookup('abeer')).results[0]?.name).toBe('Abeer Bhati');
    expect(calls).toEqual([]);
  });
});

/**
 * The boot must not depend on the network.
 *
 * The regression: `election()` fetched from Apps Script, and when that dropped
 * four times the voter watched "Preparing the ballot…" for about three minutes
 * and was then told to find the person running the election - for a candidate
 * list that had not changed since the bundle was built.
 */
describe('the election comes from the bundle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens the ballot without making a single request', async () => {
    vi.stubEnv('VITE_APPS_SCRIPT_URL', 'https://script.google.com/macros/s/AKfy/exec');
    const fetchSpy = vi.fn(() => Promise.reject(new Error('the network must not be touched')));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();

    const { api } = await import('../api');
    const election = await api.election();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(election.positions.length).toBeGreaterThan(0);
    expect(election.candidates.length).toBeGreaterThan(0);
    expect(election.auth.mode).toBe('supervised');
  });

  it('still asks the server when there is no Apps Script deployment', async () => {
    vi.resetModules();
    respondWith(JSON.stringify({ positions: [] }), 200, 'application/json');

    const { api } = await import('../api');
    await api.election();

    expect(fetch).toHaveBeenCalled();
  });
});
