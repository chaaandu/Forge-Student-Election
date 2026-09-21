import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/index.js';
import type { ElectionRepository } from '../db/electionRepository.js';
import type { IdentityOutcome, IdentityProvider } from './types.js';

export interface EntraConfig {
  readonly tenantId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

const AUTH_REQUEST_TTL_MS = 10 * 60_000;

/** Injectable so the flow can be tested without reaching Microsoft. */
export interface HttpClient {
  (url: string, init: RequestInit): Promise<Response>;
}

/**
 * Microsoft Entra ID — the production identity provider.
 *
 * Authorization-code flow with PKCE. The code is exchanged **server to server**
 * and the verified email is read from Graph `/me` on that back channel, so the
 * browser never holds a token it could tamper with and there is no id_token for
 * an attacker to forge. Impersonation therefore requires the victim's Mesa
 * credentials, which is the school's existing identity boundary.
 */
export class EntraIdentityProvider implements IdentityProvider {
  readonly mode = 'entra' as const;
  readonly supportsRollSearch = false;

  constructor(
    private readonly db: Db,
    private readonly repo: ElectionRepository,
    private readonly config: EntraConfig,
    private readonly electionId: string,
    private readonly http: HttpClient = fetch,
  ) {}

  /** Build the Microsoft authorize URL and persist the single-use state + PKCE verifier. */
  beginLogin(now: Date = new Date()): { url: string; state: string } {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    this.db
      .prepare(
        'INSERT INTO auth_requests (state, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        state,
        codeVerifier,
        now.toISOString(),
        new Date(now.getTime() + AUTH_REQUEST_TTL_MS).toISOString(),
      );

    const url = new URL(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', 'openid profile email User.Read');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Force account selection: a shared kiosk must never silently reuse the
    // previous voter's Microsoft session.
    url.searchParams.set('prompt', 'select_account');

    return { url: url.toString(), state };
  }

  async completeLogin(
    code: string,
    state: string,
    now: Date = new Date(),
  ): Promise<IdentityOutcome> {
    const request = this.db
      .prepare('SELECT * FROM auth_requests WHERE state = ?')
      .get(state) as
      | { state: string; code_verifier: string; expires_at: string; consumed_at: string | null }
      | undefined;

    if (!request || request.consumed_at !== null || new Date(request.expires_at) < now) {
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: 'That sign-in link has expired. Please start check-in again.',
      };
    }
    // Single use: consume before the network call, so a replayed callback fails
    // even if the first attempt is still in flight.
    this.db
      .prepare('UPDATE auth_requests SET consumed_at = ? WHERE state = ?')
      .run(now.toISOString(), state);

    let email: string | undefined;
    try {
      const tokenResponse = await this.http(
        `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.config.redirectUri,
            code_verifier: request.code_verifier,
            scope: 'openid profile email User.Read',
          }),
        },
      );

      if (!tokenResponse.ok) {
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: 'Microsoft sign-in did not complete. Please try again.',
        };
      }

      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) {
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: 'Microsoft sign-in did not complete. Please try again.',
        };
      }

      const meResponse = await this.http('https://graph.microsoft.com/v1.0/me', {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      if (!meResponse.ok) {
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: 'We could not read your Mesa account details. Please try again.',
        };
      }

      const me = (await meResponse.json()) as { mail?: string; userPrincipalName?: string };
      email = me.mail ?? me.userPrincipalName;
    } catch {
      // The upstream error is deliberately not surfaced: it can contain tokens.
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: 'We could not reach Microsoft sign-in. Please try again in a moment.',
      };
    }

    if (!email) {
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: 'Your Mesa account has no email address on it. Please see the returning officer.',
      };
    }

    const voter = this.repo.findVoterByEmail(email, this.electionId);
    if (!voter) {
      return {
        ok: false,
        code: 'NOT_ON_ROLL',
        message:
          `You signed in as ${email}, but that address is not on the voter roll for this ` +
          `election. Please see the returning officer.`,
      };
    }

    return { ok: true, voter };
  }
}
