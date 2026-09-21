import { describe, expect, it } from 'vitest';
import {
  currentStep,
  deriveSteps,
  initialState,
  isComplete,
  reducer,
  remaining,
  type MachineAction,
  type MachineState,
} from '../electionMachine';
import { election, employee, STUDENT_CHOICES, student } from './fixtures';

const run = (state: MachineState, ...actions: MachineAction[]): MachineState =>
  actions.reduce(reducer, state);

const loaded = reducer(initialState, { type: 'ELECTION_LOADED', election });

function atFirstGate(voter = student): MachineState {
  return run(
    loaded,
    { type: 'BEGIN_CHECK_IN' },
    { type: 'IDENTIFIED', voter, token: 'tok' },
    { type: 'CONFIRM_IDENTITY' },
  );
}

/** Walk every gate, selecting the given choices, ending on REVIEW. */
function completeBallot(voter = student): MachineState {
  let state = atFirstGate(voter);
  while (state.phase === 'GATE') {
    const step = currentStep(state)!;
    state = run(
      state,
      { type: 'SELECT', positionId: step.id, candidateId: STUDENT_CHOICES[step.id]! },
      { type: 'NEXT' },
    );
  }
  return state;
}

describe('step sequences', () => {
  it('gives a student seven gates, ending with their own house', () => {
    const steps = deriveSteps(election, student);
    expect(steps).toHaveLength(7);
    expect(steps.at(-1)?.id).toBe('house-captain-aravalli');
  });

  it('gives an employee six gates with no house captain step at all', () => {
    const steps = deriveSteps(election, employee);
    expect(steps).toHaveLength(6);
    expect(steps.some((s) => s.kind === 'house-captain')).toBe(false);
    // Not hidden, not disabled — absent.
    expect(steps.map((s) => s.id)).not.toContain('house-captain-aravalli');
  });

  it("never includes another house's contest for a student", () => {
    expect(deriveSteps(election, student).map((s) => s.id)).not.toContain('house-captain-nilgiri');
  });

  it('orders gates by configured order, not array order', () => {
    const shuffled = { ...election, positions: [...election.positions].reverse() };
    expect(deriveSteps(shuffled, student).map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('progress', () => {
  it('reports an employee total of 6, never 10', () => {
    const state = atFirstGate(employee);
    expect(state.steps).toHaveLength(6);
    expect(`${state.gateIndex + 1} / ${state.steps.length}`).toBe('1 / 6');
  });

  it('reports a student total of 7', () => {
    expect(atFirstGate(student).steps).toHaveLength(7);
  });
});

describe('navigation', () => {
  it('advances only when the current gate has a selection', () => {
    const state = atFirstGate();
    const blocked = reducer(state, { type: 'NEXT' });
    expect(blocked.gateIndex).toBe(0);
    expect(blocked.phase).toBe('GATE');

    const advanced = run(
      state,
      { type: 'SELECT', positionId: 'president', candidateId: 'p1' },
      { type: 'NEXT' },
    );
    expect(advanced.gateIndex).toBe(1);
  });

  it('preserves every selection when navigating back and forward', () => {
    let state = atFirstGate();
    state = run(
      state,
      { type: 'SELECT', positionId: 'president', candidateId: 'p1' },
      { type: 'NEXT' },
      { type: 'SELECT', positionId: 'vice-president', candidateId: 'v1' },
      { type: 'NEXT' },
      { type: 'BACK' },
      { type: 'BACK' },
    );

    expect(state.gateIndex).toBe(0);
    expect(state.selections).toEqual({ president: 'p1', 'vice-president': 'v1' });

    state = run(state, { type: 'NEXT' }, { type: 'NEXT' });
    expect(state.gateIndex).toBe(2);
    expect(state.selections['president']).toBe('p1');
  });

  it('returns to identity confirmation from the first gate', () => {
    expect(reducer(atFirstGate(), { type: 'BACK' }).phase).toBe('IDENTITY_CONFIRM');
  });

  it('reaches review after the last gate', () => {
    const state = completeBallot();
    expect(state.phase).toBe('REVIEW');
    expect(isComplete(state)).toBe(true);
  });

  it('goes back from review to the last gate', () => {
    const state = reducer(completeBallot(), { type: 'BACK' });
    expect(state.phase).toBe('GATE');
    expect(state.gateIndex).toBe(6);
  });

  it('ignores a selection aimed at a gate the voter is not on', () => {
    const state = reducer(atFirstGate(), {
      type: 'SELECT',
      positionId: 'house-captain-aravalli',
      candidateId: 'a1',
    });
    expect(state.selections).toEqual({});
  });

  it('abandons the session when leaving identity confirmation', () => {
    const state = run(
      loaded,
      { type: 'BEGIN_CHECK_IN' },
      { type: 'IDENTIFIED', voter: student, token: 'tok' },
      { type: 'BACK' },
    );
    expect(state.phase).toBe('WELCOME');
    expect(state.token).toBeNull();
    expect(state.voter).toBeNull();
  });
});

describe('editing from review', () => {
  it('jumps to the right gate and comes straight back', () => {
    let state = completeBallot();
    state = reducer(state, { type: 'EDIT', positionId: 'academic-lead-girl' });

    expect(state.phase).toBe('GATE');
    expect(currentStep(state)?.id).toBe('academic-lead-girl');
    expect(state.returnToReview).toBe(true);

    state = run(
      state,
      { type: 'SELECT', positionId: 'academic-lead-girl', candidateId: 'ag1' },
      { type: 'NEXT' },
    );
    expect(state.phase).toBe('REVIEW');
    expect(state.returnToReview).toBe(false);
  });

  it('returns to review when the voter backs out of an edit', () => {
    const edited = reducer(completeBallot(), { type: 'EDIT', positionId: 'president' });
    const state = reducer(edited, { type: 'BACK' });
    expect(state.phase).toBe('REVIEW');
    expect(state.returnToReview).toBe(false);
  });

  it('keeps every other selection when one is changed', () => {
    let state = reducer(completeBallot(), { type: 'EDIT', positionId: 'president' });
    state = run(
      state,
      { type: 'SELECT', positionId: 'president', candidateId: 'p2' },
      { type: 'NEXT' },
    );
    expect(state.selections['president']).toBe('p2');
    expect(Object.keys(state.selections)).toHaveLength(7);
  });

  it('refuses to edit a position not in this voter’s sequence', () => {
    const state = reducer(completeBallot(employee), {
      type: 'EDIT',
      positionId: 'house-captain-aravalli',
    });
    expect(state.phase).toBe('REVIEW');
  });
});

describe('submission guards', () => {
  it('refuses the final call while the ballot is incomplete', () => {
    const partial = run(
      atFirstGate(),
      { type: 'SELECT', positionId: 'president', candidateId: 'p1' },
      { type: 'NEXT' },
    );
    // Force the phase the way a manipulated client might.
    const forced = reducer({ ...partial, phase: 'REVIEW' }, { type: 'OPEN_FINAL_CALL' });
    expect(forced.phase).toBe('REVIEW');
  });

  it('opens the final call from a complete ballot', () => {
    expect(reducer(completeBallot(), { type: 'OPEN_FINAL_CALL' }).phase).toBe('FINAL_CALL');
  });

  it('cannot reach DEPARTED without passing through SUBMITTING', () => {
    const review = completeBallot();
    // No server response has happened; success must be unreachable.
    expect(reducer(review, { type: 'SUBMIT_SUCCESS', receiptId: 'r' }).phase).toBe('REVIEW');

    const finalCall = reducer(review, { type: 'OPEN_FINAL_CALL' });
    expect(reducer(finalCall, { type: 'SUBMIT_SUCCESS', receiptId: 'r' }).phase).toBe('FINAL_CALL');
  });

  it('reaches DEPARTED only from SUBMITTING', () => {
    const state = run(
      completeBallot(),
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'key-1' },
      { type: 'SUBMIT_SUCCESS', receiptId: 'receipt-1' },
    );
    expect(state.phase).toBe('DEPARTED');
    expect(state.receiptId).toBe('receipt-1');
  });

  it('keeps the same idempotency key across retries', () => {
    let state = run(
      completeBallot(),
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'key-1' },
      {
        type: 'SUBMIT_FAILED',
        error: { code: 'NETWORK', headline: 'DELAYED', message: 'retrying', retryable: true },
      },
    );
    expect(state.phase).toBe('REVIEW');

    state = run(
      state,
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'key-2' },
    );
    // A new key here would turn a retry into a second vote.
    expect(state.idempotencyKey).toBe('key-1');
  });

  it('returns to review with selections intact after a failure', () => {
    const state = run(
      completeBallot(),
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'k' },
      {
        type: 'SUBMIT_FAILED',
        error: { code: 'SERVER_ERROR', headline: 'DELAYED', message: 'not recorded', retryable: true },
      },
    );
    expect(state.phase).toBe('REVIEW');
    expect(Object.keys(state.selections)).toHaveLength(7);
    expect(state.error?.message).toMatch(/not recorded/);
  });

  it('blocks rather than returning to review when the server says already voted', () => {
    const state = run(
      completeBallot(),
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'k' },
      {
        type: 'SUBMIT_FAILED',
        error: { code: 'ALREADY_VOTED', headline: 'ALREADY DEPARTED', message: 'x', retryable: false },
      },
    );
    expect(state.phase).toBe('BLOCKED');
  });
});

describe('already-voted and closed elections', () => {
  it('blocks a voter the server reports as already voted', () => {
    const state = run(
      loaded,
      { type: 'BEGIN_CHECK_IN' },
      { type: 'IDENTIFIED', voter: { ...student, hasVoted: true }, token: 'tok' },
    );
    expect(state.phase).toBe('BLOCKED');
    expect(state.error?.headline).toBe('You have already voted');
    expect(state.error?.message).toMatch(/person running the election/);
  });

  it('blocks when the election has not opened', () => {
    const state = reducer(initialState, {
      type: 'ELECTION_LOADED',
      election: { ...election, window: { open: false, reason: 'NOT_STARTED', at: '2099-01-01T09:00:00Z' } },
    });
    expect(state.phase).toBe('BLOCKED');
    expect(state.error?.headline).toBe('Voting has not opened');
  });

  it('blocks when the election is closed', () => {
    const state = reducer(initialState, {
      type: 'ELECTION_LOADED',
      election: { ...election, window: { open: false, reason: 'CLOSED' } },
    });
    expect(state.error?.headline).toBe('Voting has closed');
  });
});

describe('reset between voters', () => {
  it('clears everything identifying but keeps the election data', () => {
    const departed = run(
      completeBallot(),
      { type: 'OPEN_FINAL_CALL' },
      { type: 'SUBMIT_START', idempotencyKey: 'k' },
      { type: 'SUBMIT_SUCCESS', receiptId: 'r' },
    );
    const reset = reducer(departed, { type: 'RESET' });

    expect(reset.phase).toBe('WELCOME');
    expect(reset.voter).toBeNull();
    expect(reset.token).toBeNull();
    expect(reset.selections).toEqual({});
    expect(reset.receiptId).toBeNull();
    expect(reset.idempotencyKey).toBeNull();
    expect(reset.election).toBe(election);
  });
});

describe('remaining()', () => {
  it('names the gates still to do, in order', () => {
    const state = run(
      atFirstGate(),
      { type: 'SELECT', positionId: 'president', candidateId: 'p1' },
      { type: 'NEXT' },
    );
    expect(remaining(state).map((p) => p.id)).toEqual([
      'vice-president',
      'academic-lead-boy',
      'academic-lead-girl',
      'community-lead-boy',
      'community-lead-girl',
      'house-captain-aravalli',
    ]);
  });
});
