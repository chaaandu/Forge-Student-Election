import type { ElectionRepository } from '../db/electionRepository.js';
import type { IdentityOutcome, IdentityProvider } from './types.js';

/**
 * Development only: pick a voter, no proof required.
 *
 * `createIdentityProvider` refuses to construct this when NODE_ENV=production,
 * and the UI displays a permanent banner. It exists so development and the test
 * suite never need real credentials — not as a fallback.
 */
export class DevIdentityProvider implements IdentityProvider {
  readonly mode = 'dev' as const;
  readonly supportsRollSearch = true;

  constructor(private readonly repo: ElectionRepository) {}

  identify(voterId: string): IdentityOutcome {
    const voter = this.repo.findVoterById(voterId);
    if (!voter) {
      return {
        ok: false,
        code: 'VOTER_NOT_FOUND',
        message: 'That voter is not on the roll for this election.',
      };
    }
    return { ok: true, voter };
  }
}
