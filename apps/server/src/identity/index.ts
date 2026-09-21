import type { Env } from '../config/env.js';
import type { Db } from '../db/index.js';
import type { ElectionRepository } from '../db/electionRepository.js';
import { AccessCodeProvider } from './accessCodeProvider.js';
import { DevIdentityProvider } from './devProvider.js';
import { EntraIdentityProvider } from './entraProvider.js';
import type { IdentityProvider } from './types.js';

export * from './types.js';
export { AccessCodeProvider, MAX_CODE_ATTEMPTS, LOCKOUT_MINUTES } from './accessCodeProvider.js';
export { DevIdentityProvider } from './devProvider.js';
export { EntraIdentityProvider } from './entraProvider.js';

export type AnyIdentityProvider =
  | DevIdentityProvider
  | AccessCodeProvider
  | EntraIdentityProvider;

export class InsecureIdentityProviderError extends Error {
  override readonly name = 'InsecureIdentityProviderError';
  constructor() {
    super(
      'AUTH_MODE=dev performs no identity verification and must never run in production. ' +
        'Set AUTH_MODE=entra (recommended) or access-code.',
    );
  }
}

export function createIdentityProvider(
  env: Env,
  db: Db,
  repo: ElectionRepository,
  electionId: string,
): AnyIdentityProvider {
  switch (env.AUTH_MODE) {
    case 'entra':
      return new EntraIdentityProvider(
        db,
        repo,
        {
          tenantId: env.MICROSOFT_TENANT_ID ?? '',
          clientId: env.MICROSOFT_CLIENT_ID ?? '',
          clientSecret: env.MICROSOFT_CLIENT_SECRET ?? '',
          redirectUri: env.MICROSOFT_REDIRECT_URI ?? '',
        },
        electionId,
      );
    case 'access-code':
      return new AccessCodeProvider(repo, env.ACCESS_CODE_PEPPER);
    case 'dev':
      // Second line of defence: loadEnv() already rejects this combination, but
      // the guard lives with the dangerous object too.
      if (env.NODE_ENV === 'production') throw new InsecureIdentityProviderError();
      return new DevIdentityProvider(repo);
  }
}

export function describeProvider(provider: IdentityProvider) {
  return { mode: provider.mode, supportsRollSearch: provider.supportsRollSearch };
}
