import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { election, employee, student } from '@/machine/__tests__/fixtures';
import { COPY } from '@/lib/copy';
import type * as ApiModule from '@/lib/api';

/** A controllable API. Every test decides what the server says and when. */
const mocks = vi.hoisted(() => ({
  election: vi.fn(),
  selectVoter: vi.fn(),
  submitBallot: vi.fn(),
  endSession: vi.fn(),
  lookup: vi.fn(),
  verifyCode: vi.fn(),
  exchangeHandoff: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/lib/api');
  return { ...actual, api: mocks };
});

const { App } = await import('@/App');

beforeEach(() => {
  // reset, not clear: a mockImplementation from one test must not leak into
  // the next and silently change what the "server" does.
  vi.resetAllMocks();
  mocks.election.mockResolvedValue(election);
  mocks.endSession.mockResolvedValue({ ended: true });
});

/** Point the roll search at whichever voter this test is acting as. */
function mockRollFor(voter: typeof student | typeof employee) {
  mocks.lookup.mockResolvedValue({
    results: [
      {
        id: voter.id,
        name: voter.name,
        maskedEmail: 'xx••@seed.invalid',
        type: voter.type,
        houseId: voter.houseId,
        hasVoted: voter.hasVoted,
      },
    ],
    truncated: false,
  });
}

afterEach(() => {
  window.sessionStorage.clear();
});

async function checkInAs(voter: typeof student | typeof employee) {
  const user = userEvent.setup();
  mockRollFor(voter);
  mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099-01-01', voter });

  render(<App />);
  await screen.findByRole('button', { name: /begin voting/i });
  await user.click(screen.getByRole('button', { name: /begin voting/i }));

  await user.type(await screen.findByLabelText(/your name/i), 'One');
  await user.click(await screen.findByRole('button', { name: new RegExp(voter.name, 'i') }));
  await user.click(await screen.findByRole('button', { name: /continue/i }));
  await user.click(await screen.findByRole('button', { name: /start voting/i }));

  return user;
}

/** Walk every gate, picking the first candidate each time. Ends on Review. */
async function completeAllGates(user: ReturnType<typeof userEvent.setup>) {
  for (let guard = 0; guard < 12; guard += 1) {
    const group = screen.queryByRole('radiogroup');
    if (!group) break;
    const [first] = within(group).getAllByRole('radio');
    await user.click(first!);
    const next = screen.getByRole('button', { name: /continue|save and review/i });
    await user.click(next);
    if (screen.queryByRole('button', { name: /confirm & submit vote/i })) break;
  }
}

describe('the employee journey', () => {
  it('has six positions and never shows a house captain step', async () => {
    const user = await checkInAs(employee);

    const seen: string[] = [];
    let firstProgress = '';
    for (let guard = 0; guard < 10; guard += 1) {
      const heading = screen.queryByRole('heading', { level: 1 });
      if (!heading) break;
      seen.push(heading.textContent ?? '');
      if (guard === 0) firstProgress = screen.getByText(/^\d+ of \d+$/).textContent ?? '';
      const group = screen.queryByRole('radiogroup');
      if (!group) break;
      await user.click(within(group).getAllByRole('radio')[0]!);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      if (screen.queryByRole('button', { name: /confirm & submit vote/i })) break;
    }

    expect(seen).toHaveLength(6);
    expect(seen.join(' ')).not.toMatch(/house captain/i);
    // The progress total is the employee's own, never "of 10".
    expect(firstProgress).toBe('1 of 6');
  });

  it('shows a ballot with no House Captains section at all', async () => {
    const user = await checkInAs(employee);
    await completeAllGates(user);

    await screen.findByRole('button', { name: /confirm & submit vote/i });
    expect(screen.getByText('Check your choices')).toBeInTheDocument();
    // Not an empty section — no section.
    expect(screen.queryByText(/house captain/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^edit your choice/i })).toHaveLength(6);
  });
});

describe('the student journey', () => {
  it('ends with their own house captain and no other house', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    await screen.findByRole('button', { name: /confirm & submit vote/i });
    expect(screen.getAllByRole('button', { name: /^edit your choice/i })).toHaveLength(7);
    expect(screen.getByText(/House Captain — Aravalli/i)).toBeInTheDocument();
    expect(screen.queryByText(/House Captain — Nilgiri/i)).not.toBeInTheDocument();
  });

  it('is told how many gates they have before starting', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099', voter: student });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /begin voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));
    await user.click(await screen.findByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/ending with your house captain/i)).toBeInTheDocument();
  });
});

describe('navigation and editing', () => {
  it('keeps selections when going back and forward', async () => {
    const user = await checkInAs(student);

    const group = screen.getByRole('radiogroup');
    const [first] = within(group).getAllByRole('radio');
    await user.click(first!);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    // The earlier choice is still selected.
    expect(within(screen.getByRole('radiogroup')).getAllByRole('radio')[0]).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('will not continue without a selection and says why', async () => {
    const user = await checkInAs(student);
    const button = screen.getByRole('button', { name: /continue/i });

    expect(button).toBeDisabled();
    expect(screen.getByText(/choose a candidate to continue/i)).toBeInTheDocument();

    await user.click(button);
    // Still on gate 1.
    expect(screen.getByText('1 of 7')).toBeInTheDocument();
  });

  it('returns to review after editing a single choice', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);
    await screen.findByRole('button', { name: /confirm & submit vote/i });

    await user.click(screen.getAllByRole('button', { name: /^edit your choice/i })[0]!);
    expect(screen.getByRole('button', { name: /save and review/i })).toBeInTheDocument();

    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    await user.click(radios[1] ?? radios[0]!);
    await user.click(screen.getByRole('button', { name: /save and review/i }));

    expect(await screen.findByRole('button', { name: /confirm & submit vote/i })).toBeInTheDocument();
  });

  it('supports arrow-key navigation within a gate', async () => {
    const user = await checkInAs(student);
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');

    radios[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radios[1]);

    await user.keyboard(' ');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });
});

describe('submission', () => {
  it('shows the required warning copy verbatim before submitting', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);
    expect(await screen.findByText(COPY.review.warning)).toBeInTheDocument();
  });

  it('requires a second confirmation before the vote leaves', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText(COPY.finalCall.body)).toBeInTheDocument();
    expect(mocks.submitBallot).not.toHaveBeenCalled();

    // The safe action takes focus.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /go back/i }));
  });

  it('NEVER shows success before the server responds', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    let resolveSubmit: (value: unknown) => void = () => {};
    mocks.submitBallot.mockImplementation(
      () => new Promise((resolve) => (resolveSubmit = resolve)),
    );

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));

    // In flight: the board says DEPARTING, and nothing claims the vote is cast.
    expect(await screen.findByText(/Recording your vote/i)).toBeInTheDocument();
    expect(screen.queryByText('Vote recorded')).not.toBeInTheDocument();
    expect(screen.queryByText(/is in the box/i)).not.toBeInTheDocument();

    resolveSubmit({ status: 'recorded', receiptId: 'r1', replayed: false, submittedAt: 'now' });
    expect(await screen.findByRole('heading', { name: 'Vote recorded' })).toBeInTheDocument();
  });

  it('shows no selections on the thank-you screen', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);
    mocks.submitBallot.mockResolvedValue({
      status: 'recorded',
      receiptId: 'r1',
      replayed: false,
      submittedAt: 'now',
    });

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));
    await screen.findByRole('heading', { name: 'Vote recorded' });

    // A shared kiosk: the next voter must not see who this one chose.
    for (const candidate of election.candidates) {
      expect(screen.queryByText(candidate.name)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/check your choices/i)).not.toBeInTheDocument();
  });

  it('reuses one idempotency key across a retry', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    const { ApiError } = await import('@/lib/api');
    mocks.submitBallot
      .mockRejectedValueOnce(new ApiError('NETWORK', 'offline', 0))
      .mockResolvedValueOnce({ status: 'recorded', receiptId: 'r1', replayed: false, submittedAt: 'n' });

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));

    await waitFor(() => expect(mocks.submitBallot).toHaveBeenCalledTimes(2), { timeout: 5000 });
    const firstKey = mocks.submitBallot.mock.calls[0]![2];
    const secondKey = mocks.submitBallot.mock.calls[1]![2];
    expect(secondKey).toBe(firstKey);
  }, 10_000);

  it('returns to review with every selection intact when submission fails', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    const { ApiError } = await import('@/lib/api');
    mocks.submitBallot.mockRejectedValue(
      new ApiError('SERVER_ERROR', 'the server said no', 500),
    );

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/NOT recorded/i);
    // Back on the boarding pass with all seven choices still there.
    expect(screen.getAllByRole('button', { name: /^edit your choice/i })).toHaveLength(7);
  });

  it('blocks a voter the server reports as already voted', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    const { ApiError } = await import('@/lib/api');
    mocks.submitBallot.mockRejectedValue(
      new ApiError('ALREADY_VOTED', 'already voted', 409),
    );

    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));

    expect(await screen.findByText('You have already voted')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/person running the election/i);
  });
});

describe('blocked states', () => {
  it('shows a themed AND plain message when a voter has already voted at check-in', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    mocks.selectVoter.mockResolvedValue({
      token: 'tok',
      expiresAt: '2099',
      voter: { ...student, hasVoted: true },
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /begin voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));
    await user.click(await screen.findByRole('button', { name: /continue/i }));

    expect(await screen.findByText('You have already voted')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.error.alreadyVoted);
  });

  it('refuses to open when the election has not started, and says when it does', async () => {
    mocks.election.mockResolvedValue({
      ...election,
      window: { open: false, reason: 'NOT_STARTED', at: '2099-03-04T09:00:00Z' },
    });

    render(<App />);
    expect(await screen.findByText('Voting has not opened')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/has not opened yet/i);
    expect(screen.queryByRole('button', { name: /begin voting/i })).not.toBeInTheDocument();
  });

  it('explains a closed election rather than offering a broken CTA', async () => {
    mocks.election.mockResolvedValue({ ...election, window: { open: false, reason: 'CLOSED' } });
    render(<App />);
    expect(await screen.findByText('Voting has closed')).toBeInTheDocument();
  });

  it('never shows a bare "something went wrong" when the election will not load', async () => {
    mocks.election.mockRejectedValue(new Error('boom'));
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/person running the election/i);
    expect(alert.textContent).not.toMatch(/^something went wrong\.?$/i);
  });
});
