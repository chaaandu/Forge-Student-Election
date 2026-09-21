import type { Candidate, House, Position } from '@mesa/election-core';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const KIOSK_TOKEN = import.meta.env.VITE_KIOSK_TOKEN ?? 'dev-kiosk-token';

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
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
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
  const body = text ? (JSON.parse(text) as unknown) : null;

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
  election: () => request<PublicElection>('/api/election'),

  lookup: (query: string) =>
    request<{ results: RollMatch[]; truncated: boolean }>('/api/auth/lookup', {
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
    request<CheckInResult>('/api/auth/select', {
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
    request<{ ended: boolean }>('/api/session/end', {
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
    request<SubmitResult>('/api/ballots', {
      method: 'POST',
      timeoutMs: 20_000,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ selections }),
    }),
};
