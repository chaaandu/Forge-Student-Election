import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api';

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
