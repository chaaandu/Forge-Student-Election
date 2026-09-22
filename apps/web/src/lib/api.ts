import type { Candidate, House, Position } from '@mesa/election-core';
import { BAKED_ELECTION } from '@/generated/election';

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
/**
 * One attempt. `callAppsScript` retries this; see why there.
 */
async function callAppsScriptOnce<T>(
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

/**
 * Retry, because Apps Script drops responses.
 *
 * A request to /exec answers with a 302 to script.googleusercontent.com, and
 * that second hop intermittently returns Google Drive's own "Page not found"
 * instead of the script's reply. Measured against the live deployment with no
 * cookies and requests spaced seconds apart: roughly one in three failed, on
 * every action — including one that touches neither the spreadsheet nor the
 * cache. It is the delivery layer, not the script, and nothing in this
 * repository can prevent it.
 *
 * What it can do is not surface it. A dropped response is indistinguishable
 * from one that never happened, so the request is simply made again.
 *
 * Only UPSTREAM is retried — a non-JSON reply, which is that failure exactly.
 * A refusal the script actually issued (already voted, ballot invalid, election
 * closed) arrives as clean JSON and is returned immediately; retrying those
 * would be asking a question that has already been answered.
 *
 * Casting is safe to repeat because the script now honours the idempotency
 * key: a repeated submission replays the original receipt rather than being
 * refused as a duplicate.
 */
async function callAppsScript<T>(
  payload: Record<string, unknown>,
  init: { method: 'GET' | 'POST'; timeoutMs?: number; budgetMs?: number },
): Promise<T> {
  const attempts = 4;
  /*
    A WALL-CLOCK CEILING, not just a count of tries.

    Four attempts at a 45-second timeout is a budget of three minutes, and it
    was spent in full: the boot fetch failed four times, the voter watched
    "Preparing the ballot…" for about three minutes, and was then told to fetch
    the person running the election. Nobody waits three minutes at a kiosk, and
    a retry that arrives after they have walked away is not a retry.

    So each call carries a deadline. Attempts stop when it passes, whether or
    not the count is used up. Casting a ballot sets its own, much longer, one —
    that is the request worth waiting for.
  */
  const deadline = Date.now() + (init.budgetMs ?? 20_000);
  let last: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (attempt > 1 && remaining <= 0) break;

    try {
      return await callAppsScriptOnce<T>(payload, {
        ...init,
        // Never let one attempt outlive the budget for all of them.
        timeoutMs: Math.max(1_000, Math.min(init.timeoutMs ?? 45_000, remaining)),
      });
    } catch (error) {
      last = error;
      const retryable = error instanceof ApiError && error.code === 'UPSTREAM';
      if (!retryable || attempt === attempts) break;
      // Short and growing. The failure is not congestion we are contributing
      // to, so there is no reason to back off hard — but spacing them slightly
      // avoids three identical requests landing in the same bad second.
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  throw last;
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

/**
 * True when the roll is searched in the browser rather than over the network.
 *
 * Apps Script only. See `fetchRoll` for why.
 */
export const rollSearchIsLocal = usingAppsScript;

/** How many names the list shows. Mirrors the cap the server applies. */
const ROLL_RESULTS = 8;

const ROLL_CACHE_KEY = 'mesa.roll';

/**
 * The roll survives a reload.
 *
 * Fetching it is the one slow thing left in the search, and a kiosk that is
 * refreshed between voters would otherwise pay that wait again every time.
 *
 * sessionStorage, not localStorage: it lasts as long as the tab the election
 * is being run in and no longer, so a roll does not outlive the election on a
 * shared school machine.
 */
function readStoredRoll(): RollMatch[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ROLL_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RollMatch[]) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    // A quota error, private browsing, or a half-written value. The roll is a
    // cache; losing it costs one fetch.
    return null;
  }
}

function storeRoll(roll: RollMatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ROLL_CACHE_KEY, JSON.stringify(roll));
  } catch {
    // As above.
  }
}

let cachedRoll: RollMatch[] | null = usingAppsScript ? readStoredRoll() : null;
let rollInFlight: Promise<RollMatch[]> | null = null;

/**
 * The roll, fetched once.
 *
 * Searching 145 names does not need a request per keystroke, and against Apps
 * Script it cannot have one: the script answers in about a second, but the
 * content layer in front of it runs between 0.5s and 30s and drops roughly one
 * reply in three, so it retries. Typing a name meant several multi-second
 * requests in flight at once, answering queries the voter had already finished
 * typing, and a list that flickered between them. Debouncing only chose how
 * long to wait before paying that cost.
 *
 * The roll is small and static while voting is open, so it is fetched once and
 * matched here. Typing then costs nothing and cannot race itself.
 */
function fetchRoll(): Promise<RollMatch[]> {
  if (!rollInFlight) {
    rollInFlight = callAppsScript<{ voters: RollMatch[] }>(
      { action: 'roll' },
      { method: 'GET' },
    ).then((payload) => {
      cachedRoll = payload.voters ?? [];
      storeRoll(cachedRoll);
      return cachedRoll;
    });
    // Cleared whether it resolved or threw, so a failed prime can be retried
    // rather than being remembered as a permanently rejected promise.
    void rollInFlight.catch(() => {}).finally(() => {
      rollInFlight = null;
    });
  }
  return rollInFlight;
}

/** Lowercase, accents off. The half both foldings below share. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Punctuation REMOVED, not turned into a space.
 *
 * So "D'Souza" is reached by typing "dsouza" and "Jean-Luc" by "jeanluc",
 * which is how people type a name they are not looking at. Spacing the
 * apostrophe instead loses exactly that spelling.
 */
function tighten(value: string): string {
  return normalise(value)
    .replace(/[^a-z0-9@. ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every word a row can be matched on the front of.
 *
 * Both foldings, because each loses a spelling the other keeps: "Maria
 * D'Souza" is findable as maria, dsouza, d or souza, and a voter hunting for
 * their own name under a queue should not have to guess which of those the
 * roll was typed with.
 */
function wordsOf(value: string): string[] {
  const split = normalise(value)
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim()
    .split(' ');
  return [...new Set([...tighten(value).split(' '), ...split])].filter(Boolean);
}

/**
 * Match a query against the roll, best first.
 *
 * Every whitespace-separated term must match somewhere, so "bhati abeer" finds
 * the same person as "abeer bhati" — people type their own name in whichever
 * order, and a surname-first search returning nothing looks like being missing
 * from the roll.
 *
 * Ranked by the WORST-placed term, so a row where both terms begin words sorts
 * above one where a term only appears inside the address.
 *
 * SORTED BEFORE IT IS CAPPED. The eight shown are the eight best matches, not
 * the first eight encountered — which is the one thing a list like this must
 * get right, because a voter who cannot find their name cannot vote.
 */
export function matchRoll(
  roll: RollMatch[],
  query: string,
): { results: RollMatch[]; truncated: boolean } {
  const terms = tighten(query).split(' ').filter(Boolean);
  if (terms.length === 0) return { results: [], truncated: false };

  const scored: { match: RollMatch; rank: number }[] = [];

  for (const match of roll) {
    const name = tighten(match.name);
    const words = wordsOf(match.name);
    const email = tighten(match.maskedEmail);

    let worst = 0;
    let all = true;

    for (const term of terms) {
      let rank: number;
      if (name.startsWith(term)) rank = 0;
      else if (words.some((word) => word.startsWith(term))) rank = 1;
      else if (name.includes(term)) rank = 2;
      else if (email.includes(term)) rank = 3;
      else {
        all = false;
        break;
      }
      if (rank > worst) worst = rank;
    }

    if (all) scored.push({ match, rank: worst });
  }

  scored.sort((a, b) => a.rank - b.rank || a.match.name.localeCompare(b.match.name));

  return {
    results: scored.slice(0, ROLL_RESULTS).map((entry) => entry.match),
    truncated: scored.length > ROLL_RESULTS,
  };
}

export const api = {
  /**
   * The ballot, with no network at all.
   *
   * Houses, positions and candidates are compiled into the bundle by
   * `npm run election:bake`, because they cannot change while the bundle is
   * the bundle. Fetching them was the single point of failure in the boot: one
   * flaky request stood between the voter and a screen that could have been
   * drawn from disk.
   */
  election: async (): Promise<PublicElection> => {
    if (!usingAppsScript) return request<PublicElection>('/api/election');
    return BAKED_ELECTION;
  },

  /** True when `election()` answered from the bundle rather than the server. */
  electionIsBaked: usingAppsScript,

  /**
   * Re-check the one field that can change during polling.
   *
   * The baked copy cannot know the election was closed after the bundle was
   * built. This is asked for in the background, and applied only while nobody
   * is part-way through voting. It is a courtesy, not a control: the server
   * re-checks the window before recording anything.
   */
  electionFresh: () =>
    callAppsScript<PublicElection>({ action: 'election' }, { method: 'GET', budgetMs: 25_000 }),

  /**
   * Warm the roll so the first keystroke is already answered.
   *
   * Called when the check-in screen opens, which buys the seconds a voter
   * spends reaching for the keyboard. Failure is not raised: `lookup` falls
   * back to asking the server per query, and a slow search is better than a
   * screen that refuses to open.
   */
  primeRoll: async (): Promise<void> => {
    if (!usingAppsScript) return;
    try {
      await fetchRoll();
    } catch {
      // Deliberately swallowed; see above.
    }
  },

  lookup: async (query: string) => {
    const trimmed = query.trim();

    if (!usingAppsScript) {
      return request<{ results: RollMatch[]; truncated: boolean }>('/api/auth/lookup', {
        method: 'POST',
        headers: { 'x-kiosk-token': KIOSK_TOKEN },
        body: JSON.stringify({ query: trimmed }),
      });
    }

    // The same floor the server applies, so the two agree about what is too
    // short to search on whichever path answers.
    if (trimmed.length < 2) return { results: [], truncated: false };

    if (cachedRoll) return matchRoll(cachedRoll, trimmed);

    /*
      NEVER WAIT FOR THE ROLL.

      This used to `await fetchRoll()`, which handed the first voter to type
      the whole of the slow fetch — the exact wait the local search exists to
      remove, just moved from every keystroke to the first one.

      So the roll is started in the background and this query is answered the
      old way, which is no worse than before it existed. Once the roll lands,
      every keystroke after it is free.
    */
    void fetchRoll().catch(() => {});

    return callAppsScript<{ results: RollMatch[]; truncated: boolean }>(
      { action: 'lookup', query: trimmed },
      { method: 'GET' },
    );
  },

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
          { method: 'POST', timeoutMs: 60_000, budgetMs: 150_000 },
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
