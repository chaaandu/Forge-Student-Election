import type { Candidate, House, Position } from '@mesa/election-core';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const KIOSK_TOKEN = import.meta.env.VITE_KIOSK_TOKEN ?? 'dev-kiosk-token';

/**
 * The Apps Script deployment, when there is no Express server behind the app.
 *
 * Set VITE_APPS_SCRIPT_URL to the /exec URL and every call below is routed to
 * it instead. The two speak different shapes — Apps Script has one endpoint and
 * an `action`, not a REST surface — so the difference is absorbed here rather
 * than leaking into the screens or the state machine, neither of which should
 * know where the election is hosted.
 */
const APPS_SCRIPT = import.meta.env.VITE_APPS_SCRIPT_URL ?? '';
export const usingAppsScript = APPS_SCRIPT !== '';

/**
 * Talk to Apps Script without tripping a CORS preflight.
 *
 * A browser sending `application/json` makes the request non-simple, so it
 * sends OPTIONS first — and an Apps Script web app cannot answer OPTIONS. The
 * ballot would fail before a vote was ever transmitted. `text/plain` keeps it a
 * simple request. The body is still JSON; only the declared type differs, and
 * the script parses it as JSON regardless.
 */
async function callAppsScript<T>(
  payload: Record<string, unknown>,
  init: { method: 'GET' | 'POST'; timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  /*
    Forty-five seconds by default, not twenty.

    Apps Script runs the handler in about a second; Google's content layer in
    front of it was measured between 0.5s and 30s for the same request. A
    twenty-second abort on a platform that routinely takes longer does not
    protect anyone — it just converts a slow success into "The request took too
    long. It may or may not have reached the server", which is the most
    alarming message this client can produce and one a voter cannot act on.

    Casting a ballot overrides this upward again; see `submitBallot`.
  */
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 45_000);

  let response: Response;
  try {
    if (init.method === 'GET') {
      const url = new URL(APPS_SCRIPT);
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
      response = await fetch(url.toString(), { signal: controller.signal, redirect: 'follow' });
    } else {
      response = await fetch(APPS_SCRIPT, {
        method: 'POST',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    }
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    throw new ApiError(
      aborted ? 'TIMEOUT' : 'NETWORK',
      aborted
        ? 'The request took too long. It may or may not have reached the server.'
        : 'We could not reach the election server.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Apps Script answers with an HTML error page when the deployment is not
    // published to "Anyone" — the commonest setup mistake, and one that would
    // otherwise surface as a JSON parse error naming nothing useful.
    throw new ApiError(
      'UPSTREAM',
      'We could not reach the election server. Check the script is deployed with access set to Anyone.',
      response.status,
    );
  }

  const envelope = body as { error?: { code?: string; message?: string; status?: number } };
  if (envelope?.error) {
    throw new ApiError(
      envelope.error.code ?? 'SERVER_ERROR',
      envelope.error.message ?? 'The election server rejected that request.',
      envelope.error.status ?? 400,
    );
  }

  return body as T;
}

export interface PublicElection {
  election: {
    id: string;
    name: string;
    status: 'draft' | 'open' | 'closed';
    opensAt?: string;
    closesAt?: string;
    /** True while demo candidates and demo voters are configured. */
    isSeedData?: boolean;
  };
  houses: House[];
  positions: Position[];
  candidates: Candidate[];
  window: { open: true } | { open: false; reason: 'NOT_STARTED' | 'CLOSED' | 'DRAFT'; at?: string };
  auth: {
    mode: 'entra' | 'access-code' | 'supervised';
    supportsRollSearch: boolean;
    /** Identity rests on the invigilator; switches on booth-facing affordances. */
    requiresSupervision: boolean;
  };
  configVersion: string;
}

export interface VoterProfile {
  id: string;
  name: string;
  email: string;
  type: 'student' | 'employee';
  houseId: string | null;
  hasVoted: boolean;
  /** The voter's OWN gate sequence, decided by the server. */
  eligiblePositionIds: string[];
}

export interface RollMatch {
  id: string;
  name: string;
  maskedEmail: string;
  type: 'student' | 'employee';
  houseId: string | null;
  hasVoted: boolean;
}

export interface CheckInResult {
  token: string;
  expiresAt: string;
  voter: VoterProfile;
}

export interface SubmitResult {
  status: 'recorded';
  receiptId: string;
  replayed: boolean;
  submittedAt: string;
}

/**
 * A failure the UI can branch on.
 *
 * `code` is the server's stable machine code, or `NETWORK` when the request
 * never arrived. The distinction matters: a network failure may be retried
 * safely with the same idempotency key; a 422 must not be.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    override readonly message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request may not have reached the server at all. */
  get isNetwork(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.code === 'UPSTREAM';
  }

  get isRetryable(): boolean {
    return this.isNetwork || this.status >= 500;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    throw new ApiError(
      aborted ? 'TIMEOUT' : 'NETWORK',
      aborted
        ? 'The request took too long. It may or may not have reached the server.'
        : 'We could not reach the election server.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  /*
    Something other than the election server can answer on this URL, and when it
    does it answers in HTML: a static host with no /api behind it, a reverse
    proxy's own 502 page, a venue captive portal. `JSON.parse` on that threw a
    bare SyntaxError that escaped this function entirely — so every caller lost
    the ApiError contract it branches on (`isNetwork`, `isRetryable`, `code`),
    and the console read `Unexpected token 'T', "The page c"...` instead of
    saying the server was never reached. A Vercel deployment of the SPA showed
    exactly this on every check-in.

    UPSTREAM rather than SERVER_ERROR, and counted as a network failure: the
    request may or may not have reached the server, which is precisely the
    condition under which a ballot must be retried with the SAME idempotency
    key rather than abandoned.
  */
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(
        'UPSTREAM',
        'We could not reach the election server. Something else answered instead.',
        response.status,
      );
    }
  }

  if (!response.ok) {
    const envelope = body as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiError(
      envelope?.error?.code ?? 'SERVER_ERROR',
      envelope?.error?.message ??
        'The election server rejected that request and nothing was recorded.',
      response.status,
      envelope?.error?.details,
    );
  }

  return body as T;
}

export const api = {
  election: () =>
    usingAppsScript
      ? callAppsScript<PublicElection>({ action: 'election' }, { method: 'GET' })
      : request<PublicElection>('/api/election'),

  lookup: (query: string) =>
    usingAppsScript
      ? callAppsScript<{ results: RollMatch[]; truncated: boolean }>(
          { action: 'lookup', query },
          { method: 'GET' },
        )
      : request<{ results: RollMatch[]; truncated: boolean }>('/api/auth/lookup', {
          method: 'POST',
          headers: { 'x-kiosk-token': KIOSK_TOKEN },
          body: JSON.stringify({ query }),
        }),

  verifyCode: (voterId: string, code: string) =>
    request<CheckInResult>('/api/auth/verify', {
      method: 'POST',
      headers: { 'x-kiosk-token': KIOSK_TOKEN },
      body: JSON.stringify({ voterId, code }),
    }),

  /** Supervised check-in: the voter selects their own name at the booth. */
  selectVoter: (voterId: string) =>
    usingAppsScript
      ? callAppsScript<CheckInResult>({ action: 'select', voterId }, { method: 'POST' })
      : request<CheckInResult>('/api/auth/select', {
          method: 'POST',
          headers: { 'x-kiosk-token': KIOSK_TOKEN },
          body: JSON.stringify({ voterId }),
        }),

  exchangeHandoff: (code: string) =>
    request<CheckInResult>('/api/auth/entra/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  endSession: (token: string) =>
    usingAppsScript
      ? // Nothing to revoke: the Apps Script token is a signed, self-expiring
        // string rather than a row, so there is no server state to clear. The
        // journey still ends here for the voter.
        Promise.resolve({ ended: true })
      : request<{ ended: boolean }>('/api/session/end', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        }),

  /**
   * Submit a ballot.
   *
   * `idempotencyKey` is generated ONCE per ballot by the caller and reused for
   * every retry, so a timeout followed by a retry can never produce a second
   * vote. A new key here would defeat the whole mechanism.
   */
  submitBallot: (token: string, selections: Record<string, string>, idempotencyKey: string) =>
    usingAppsScript
      ? callAppsScript<SubmitResult>(
          { action: 'ballot', token, selections, idempotencyKey },
          /*
            Sixty seconds, not twenty.

            Apps Script answers in about a second but Google's content layer in
            front of it is slow and wildly variable — measured between 0.5s and
            30s for the same request. Aborting at twenty produced "STILL
            SENDING" on votes that were in fact being recorded, and sent the
            voter round the retry loop for a ballot that had already landed.

            Waiting longer is the right trade here: the retry is safe (a second
            attempt is refused as ALREADY_VOTED, never double-counted) but it is
            alarming, and a voter who has just pressed the button should not be
            told something went wrong because Google was thinking.
          */
          { method: 'POST', timeoutMs: 60_000 },
        )
      : request<SubmitResult>('/api/ballots', {
          method: 'POST',
          timeoutMs: 20_000,
          headers: {
            authorization: `Bearer ${token}`,
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({ selections }),
        }),
};
