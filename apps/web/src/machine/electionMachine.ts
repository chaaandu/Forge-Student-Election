import type { Position } from '@mesa/election-core';
import type { PublicElection, VoterProfile } from '@/lib/api';
import { COPY, HEADLINE } from '@/lib/copy';

/**
 * The voting journey as an explicit state machine.
 *
 * Every transition is guarded. An action that does not apply to the current
 * phase returns the state unchanged rather than half-applying, so no sequence
 * of clicks — or a stray event during an animation — can produce an impossible
 * election state such as "submitting with no selections" or "review before the
 * last gate".
 *
 * The gate sequence is derived from the voter's OWN eligible positions, as
 * decided by the server. An employee's journey runs Community Lead → Review;
 * the House Captains step is not hidden or skipped, it is not in `steps` at all.
 */

export type Phase =
  | 'LOADING'
  | 'WELCOME'
  | 'CHECK_IN'
  | 'IDENTITY_CONFIRM'
  | 'GATE'
  | 'REVIEW'
  | 'FINAL_CALL'
  | 'SUBMITTING'
  | 'DEPARTED'
  | 'BLOCKED';

export interface MachineError {
  code: string;
  /** Plain language. A voter should not have to decode a theme word. */
  headline: string;
  /** What happened and what to do about it. */
  message: string;
  /** Whether the voter may retry the same action. */
  retryable: boolean;
}

export interface MachineState {
  phase: Phase;
  election: PublicElection | null;
  voter: VoterProfile | null;
  token: string | null;
  steps: Position[];
  gateIndex: number;
  selections: Record<string, string>;
  /** Set when a gate was reached via "Edit" from the review screen. */
  returnToReview: boolean;
  /** Generated once per ballot. Reused on every retry — never regenerated. */
  idempotencyKey: string | null;
  receiptId: string | null;
  error: MachineError | null;
  /** Transition direction for the gate animation: forward or back. */
  direction: 1 | -1;
}

export type MachineAction =
  | { type: 'ELECTION_LOADED'; election: PublicElection }
  | { type: 'FATAL'; error: MachineError }
  | { type: 'BEGIN_CHECK_IN' }
  | { type: 'IDENTIFIED'; voter: VoterProfile; token: string }
  | { type: 'CONFIRM_IDENTITY' }
  | { type: 'SELECT'; positionId: string; candidateId: string }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'EDIT'; positionId: string }
  | { type: 'OPEN_FINAL_CALL' }
  | { type: 'CLOSE_FINAL_CALL' }
  | { type: 'SUBMIT_START'; idempotencyKey: string }
  | { type: 'SUBMIT_SUCCESS'; receiptId: string }
  | { type: 'SUBMIT_FAILED'; error: MachineError }
  | { type: 'DISMISS_ERROR' }
  | { type: 'RESET' };

export const initialState: MachineState = {
  phase: 'LOADING',
  election: null,
  voter: null,
  token: null,
  steps: [],
  gateIndex: 0,
  selections: {},
  returnToReview: false,
  idempotencyKey: null,
  receiptId: null,
  error: null,
  direction: 1,
};

/**
 * The voter's gate sequence.
 *
 * Built from `eligiblePositionIds`, which the server computed from its own
 * voter record — so the client cannot show a gate the server would reject, and
 * the progress denominator is always the voter's real total.
 */
export function deriveSteps(election: PublicElection, voter: VoterProfile): Position[] {
  const allowed = new Set(voter.eligiblePositionIds);
  return election.positions
    .filter((position) => allowed.has(position.id))
    .sort((a, b) => a.order - b.order);
}

/** Positions still without a selection, in gate order. */
export function remaining(state: MachineState): Position[] {
  return state.steps.filter((step) => !state.selections[step.id]);
}

export function currentStep(state: MachineState): Position | undefined {
  return state.steps[state.gateIndex];
}

export function isComplete(state: MachineState): boolean {
  return state.steps.length > 0 && remaining(state).length === 0;
}

/** Reset to the welcome screen with the election data kept. */
function toWelcome(state: MachineState): MachineState {
  return {
    ...initialState,
    phase: 'WELCOME',
    election: state.election,
  };
}

export function reducer(state: MachineState, action: MachineAction): MachineState {
  switch (action.type) {
    case 'ELECTION_LOADED': {
      const { window: electionWindow } = action.election;
      if (!electionWindow.open) {
        return {
          ...state,
          election: action.election,
          phase: 'BLOCKED',
          error: {
            code: electionWindow.reason === 'NOT_STARTED' ? 'ELECTION_NOT_STARTED' : 'ELECTION_CLOSED',
            headline:
              electionWindow.reason === 'NOT_STARTED' ? HEADLINE.notOpen : HEADLINE.closed,
            message:
              electionWindow.reason === 'NOT_STARTED'
                ? `Voting has not opened yet${electionWindow.at ? `. It opens at ${formatTime(electionWindow.at)}` : ''}.`
                : `Voting is closed${electionWindow.at ? `. It closed at ${formatTime(electionWindow.at)}` : ''}. Votes can no longer be accepted.`,
            retryable: false,
          },
        };
      }
      return { ...state, election: action.election, phase: 'WELCOME', error: null };
    }

    case 'FATAL':
      return { ...state, phase: 'BLOCKED', error: action.error };

    case 'BEGIN_CHECK_IN':
      if (state.phase !== 'WELCOME') return state;
      return { ...state, phase: 'CHECK_IN', error: null, direction: 1 };

    case 'IDENTIFIED': {
      if (state.phase !== 'CHECK_IN' && state.phase !== 'WELCOME') return state;
      if (!state.election) return state;

      // A voter who has already voted never reaches a gate.
      if (action.voter.hasVoted) {
        return {
          ...state,
          voter: action.voter,
          token: action.token,
          phase: 'BLOCKED',
          error: {
            code: 'ALREADY_VOTED',
            headline: HEADLINE.alreadyVoted,
            message: COPY.error.alreadyVoted,
            retryable: false,
          },
        };
      }

      return {
        ...state,
        voter: action.voter,
        token: action.token,
        steps: deriveSteps(state.election, action.voter),
        phase: 'IDENTITY_CONFIRM',
        error: null,
        direction: 1,
      };
    }

    case 'CONFIRM_IDENTITY':
      if (state.phase !== 'IDENTITY_CONFIRM' || state.steps.length === 0) return state;
      return { ...state, phase: 'GATE', gateIndex: 0, direction: 1 };

    case 'SELECT': {
      if (state.phase !== 'GATE') return state;
      // A selection may only be made for the gate the voter is actually on.
      const step = currentStep(state);
      if (!step || step.id !== action.positionId) return state;

      return {
        ...state,
        selections: { ...state.selections, [action.positionId]: action.candidateId },
      };
    }

    case 'NEXT': {
      if (state.phase !== 'GATE') return state;
      const step = currentStep(state);
      // Guard: Continue does nothing without a selection, whatever the UI did.
      if (!step || !state.selections[step.id]) return state;

      // Editing from the review screen returns to the review screen.
      if (state.returnToReview) {
        return { ...state, phase: 'REVIEW', returnToReview: false, direction: 1 };
      }
      if (state.gateIndex >= state.steps.length - 1) {
        return { ...state, phase: 'REVIEW', direction: 1 };
      }
      return { ...state, gateIndex: state.gateIndex + 1, direction: 1 };
    }

    case 'BACK': {
      if (state.phase === 'GATE') {
        if (state.returnToReview) {
          return { ...state, phase: 'REVIEW', returnToReview: false, direction: -1 };
        }
        if (state.gateIndex === 0) {
          return { ...state, phase: 'IDENTITY_CONFIRM', direction: -1 };
        }
        return { ...state, gateIndex: state.gateIndex - 1, direction: -1 };
      }
      if (state.phase === 'REVIEW') {
        return {
          ...state,
          phase: 'GATE',
          gateIndex: Math.max(0, state.steps.length - 1),
          direction: -1,
        };
      }
      if (state.phase === 'FINAL_CALL') {
        return { ...state, phase: 'REVIEW', direction: -1 };
      }
      if (state.phase === 'IDENTITY_CONFIRM') {
        // Leaving identity confirmation abandons the check-in entirely: a
        // half-identified session on a shared kiosk is worse than none.
        return { ...toWelcome(state), phase: 'WELCOME' };
      }
      if (state.phase === 'CHECK_IN') {
        return toWelcome(state);
      }
      return state;
    }

    case 'EDIT': {
      if (state.phase !== 'REVIEW') return state;
      const index = state.steps.findIndex((step) => step.id === action.positionId);
      if (index === -1) return state;
      return { ...state, phase: 'GATE', gateIndex: index, returnToReview: true, direction: -1 };
    }

    case 'OPEN_FINAL_CALL':
      // Never openable from an incomplete ballot, whatever the button did.
      if (state.phase !== 'REVIEW' || !isComplete(state)) return state;
      return { ...state, phase: 'FINAL_CALL' };

    case 'CLOSE_FINAL_CALL':
      if (state.phase !== 'FINAL_CALL') return state;
      return { ...state, phase: 'REVIEW' };

    case 'SUBMIT_START':
      if (state.phase !== 'FINAL_CALL' || !isComplete(state)) return state;
      return {
        ...state,
        phase: 'SUBMITTING',
        error: null,
        // Generated once and kept: a retry after a timeout must carry the SAME
        // key, or the retry becomes a second vote.
        idempotencyKey: state.idempotencyKey ?? action.idempotencyKey,
      };

    case 'SUBMIT_SUCCESS':
      // Success is reachable only from SUBMITTING — i.e. only after a real
      // server response. There is no timer path to this state.
      if (state.phase !== 'SUBMITTING') return state;
      return { ...state, phase: 'DEPARTED', receiptId: action.receiptId, error: null };

    case 'SUBMIT_FAILED': {
      if (state.phase !== 'SUBMITTING') return state;
      if (action.error.code === 'ALREADY_VOTED') {
        return { ...state, phase: 'BLOCKED', error: action.error };
      }
      // Back to review with every selection intact.
      return { ...state, phase: 'REVIEW', error: action.error };
    }

    case 'DISMISS_ERROR':
      return { ...state, error: null };

    case 'RESET':
      return toWelcome(state);

    default:
      return state;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
