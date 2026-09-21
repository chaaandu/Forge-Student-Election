import type { Env } from '../config/env.js';
import type { Db } from '../db/index.js';
import type { ElectionRepository } from '../db/electionRepository.js';
import { AccessCodeProvider } from './accessCodeProvider.js';
import { SupervisedIdentityProvider } from './supervisedProvider.js';
import { EntraIdentityProvider } from './entraProvider.js';
import type { IdentityProvider } from './types.js';

export * from './types.js';
export { AccessCodeProvider, MAX_CODE_ATTEMPTS, LOCKOUT_MINUTES } from './accessCodeProvider.js';
export { SupervisedIdentityProvider } from './supervisedProvider.js';
export { EntraIdentityProvider } from './entraProvider.js';

export type AnyIdentityProvider =
  | SupervisedIdentityProvider
  | AccessCodeProvider
  | EntraIdentityProvider;

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
    case 'supervised':
      return new SupervisedIdentityProvider(repo);
  }
}

export function describeProvider(provider: IdentityProvider) {
  return {
    mode: provider.mode,
    supportsRollSearch: provider.supportsRollSearch,
    requiresSupervision: provider.requiresSupervision,
  };
}
