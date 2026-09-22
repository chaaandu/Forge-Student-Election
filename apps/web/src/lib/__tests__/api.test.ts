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
