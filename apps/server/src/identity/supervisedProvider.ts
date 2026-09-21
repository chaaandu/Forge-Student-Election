import type { ElectionRepository } from '../db/electionRepository.js';
import type { IdentityOutcome, IdentityProvider } from './types.js';

/**
 * Supervised kiosk voting.
 *
 * The voter selects their own name from the roll and is issued a session. There
 * is no credential, because in this deployment identity is established by a
 * human: voting happens in one room, at a booth, with a Mesa employee present
 * who knows the students. This is how a paper ballot works — someone at a desk
 * checks you off a roll — and it is a deliberate, documented choice rather than
 * a missing feature.
 *
 * WHAT THIS STILL GUARANTEES (all enforced server-side, unchanged):
 *   • one ballot per voter, ever;
 *   • no ballot for a voter already marked as voted;
 *   • a ballot containing positions the voter is not eligible for is rejected;
 *   • every check-in and every ballot is recorded in the audit log.
 *
 * WHAT IT DOES NOT GUARANTEE:
 *   • that the person at the booth is who they selected. Nothing in software
 *     checks that; the invigilator does. The mitigations that exist here are
 *     supporting ones: the confirmation screen shows the chosen name large
 *     enough to read across a booth, roll search marks who has already voted,
 *     and /monitor gives the invigilator a live list of who has voted.
 *
 * If that trade is not acceptable for a given election, switch AUTH_MODE to
 * `access-code` (codes handed out against student ID) or `entra`. Both are
 * implemented and tested; it is a one-line environment change.
 */
export class SupervisedIdentityProvider implements IdentityProvider {
  readonly mode = 'supervised' as const;
  readonly supportsRollSearch = true;
  /** Surfaced to the UI so the invigilator-facing affordances are switched on. */
  readonly requiresSupervision = true;

  constructor(private readonly repo: ElectionRepository) {}

  identify(voterId: string): IdentityOutcome {
    const voter = this.repo.findVoterById(voterId);
    if (!voter) {
      return {
        ok: false,
        code: 'VOTER_NOT_FOUND',
        message:
          'That name is not on the roll for this election. Please ask the invigilator.',
      };
    }
    return { ok: true, voter };
  }
}
