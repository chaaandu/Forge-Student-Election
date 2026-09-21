import type { VoterRecord } from '../db/electionRepository.js';

export type IdentityMode = 'entra' | 'access-code' | 'dev';

export interface IdentityResult {
  readonly ok: true;
  readonly voter: VoterRecord;
}

export interface IdentityFailure {
  readonly ok: false;
  readonly code:
    | 'VOTER_NOT_FOUND'
    | 'INVALID_CODE'
    | 'LOCKED_OUT'
    | 'NOT_ON_ROLL'
    | 'PROVIDER_ERROR';
  /** Plain language, safe to show. Never reveals whether an account exists where that matters. */
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly attemptsRemaining?: number;
}

export type IdentityOutcome = IdentityResult | IdentityFailure;

/**
 * Identity is a server-side binding, never a client assertion.
 *
 * Selecting a name in the UI is navigation. Whatever this provider returns is
 * what the session is bound to, and the ballot endpoint reads the voter from
 * the session — never from the request body. See docs/security-model.md §3.
 */
export interface IdentityProvider {
  readonly mode: IdentityMode;
  /** True when the UI should offer roll search (code/dev), false for a redirect flow (entra). */
  readonly supportsRollSearch: boolean;
}
