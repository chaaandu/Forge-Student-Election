import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { election, employee, student } from '@/machine/__tests__/fixtures';
import { COPY, HEADLINE } from '@/lib/copy';
import { ApiError as ApiErrorCtor } from '@/lib/api';
import type * as ApiModule from '@/lib/api';

/** A controllable API. Every test decides what the server says and when. */
const mocks = vi.hoisted(() => ({
  election: vi.fn(),
  selectVoter: vi.fn(),
  submitBallot: vi.fn(),
  endSession: vi.fn(),
  lookup: vi.fn(),
  primeRoll: vi.fn(),
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
  mocks.primeRoll.mockResolvedValue(undefined);
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
  await screen.findByRole('button', { name: /start voting/i });
  await user.click(screen.getByRole('button', { name: /start voting/i }));

  await user.type(await screen.findByLabelText(/your name/i), 'One');
  await user.click(await screen.findByRole('button', { name: new RegExp(voter.name, 'i') }));
  // Identity confirmation: "That's me".
  await user.click(await screen.findByRole('button', { name: /that.s me/i }));

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
    expect(screen.getAllByRole('button', { name: /^change your pick/i })).toHaveLength(6);
  });
});

describe('the student journey', () => {
  it('ends with their own house captain and no other house', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);

    await screen.findByRole('button', { name: /confirm & submit vote/i });
    expect(screen.getAllByRole('button', { name: /^change your pick/i })).toHaveLength(7);
    expect(screen.getByText(/Aravalli House Captain/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nilgiri House Captain/i)).not.toBeInTheDocument();
  });

  /**
   * The identity pass confirms WHO, and nothing else.
   *
   * It used to pre-explain the ballot — "7 choices, ending with your house
   * captain", or for an employee "House captains are voted on by students",
   * which answered a question nobody had asked about a screen they would never
   * see. The count belongs on the first position, where the progress row shows
   * it at the moment it becomes useful; that is asserted just below.
   */
  it('confirms who is voting, without explaining the ballot first', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099', voter: student });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));

    expect(await screen.findByRole('button', { name: /that.s me/i })).toBeInTheDocument();
    expect(await screen.findByText(student.name)).toBeInTheDocument();
    expect(screen.queryByText(/choices/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/house captains are voted on by students/i)).not.toBeInTheDocument();
  });

  it('shows the count on the first position instead, where it is useful', async () => {
    const user = await checkInAs(student);
    expect(await screen.findByText(`1 of ${student.eligiblePositionIds.length}`)).toBeInTheDocument();
    await user.click(screen.getAllByRole('radio')[0]!);
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
    expect(screen.getByText('Pick one.')).toBeInTheDocument();

    // The reason is attached to the button as a description, not folded into
    // its name — so it is announced on focus without becoming "Continue, pick
    // a candidate for President to continue" every time.
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/pick a candidate/i);

    await user.click(button);
    // Still on gate 1.
    expect(screen.getByText('1 of 7')).toBeInTheDocument();
  });

  it('returns to review after editing a single choice', async () => {
    const user = await checkInAs(student);
    await completeAllGates(user);
    await screen.findByRole('button', { name: /confirm & submit vote/i });

    await user.click(screen.getAllByRole('button', { name: /^change your pick/i })[0]!);
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
    expect(alert).toHaveTextContent(COPY.error.submitFailed);
    // The point of that sentence, pinned independently of its wording.
    expect(COPY.error.submitFailed).toMatch(/not recorded/i);
    expect(COPY.error.submitFailed).toMatch(/nothing was saved/i);
    // Back on the boarding pass with all seven choices still there.
    expect(screen.getAllByRole('button', { name: /^change your pick/i })).toHaveLength(7);
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

    expect(await screen.findByText(HEADLINE.alreadyVoted)).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));

    expect(await screen.findByText(HEADLINE.alreadyVoted)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.error.alreadyVoted);
  });

  it('refuses to open when the election has not started, and says when it does', async () => {
    mocks.election.mockResolvedValue({
      ...election,
      window: { open: false, reason: 'NOT_STARTED', at: '2099-03-04T09:00:00Z' },
    });

    render(<App />);
    expect(await screen.findByText(HEADLINE.notOpen)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.error.notOpen);
    expect(screen.queryByRole('button', { name: /start voting/i })).not.toBeInTheDocument();
  });

  it('explains a closed election rather than offering a broken CTA', async () => {
    mocks.election.mockResolvedValue({ ...election, window: { open: false, reason: 'CLOSED' } });
    render(<App />);
    expect(await screen.findByText(HEADLINE.closed)).toBeInTheDocument();
  });

  it('never shows a bare "something went wrong" when the election will not load', async () => {
    mocks.election.mockRejectedValue(new Error('boom'));
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/person running the election/i);
    expect(alert.textContent).not.toMatch(/^something went wrong\.?$/i);
  });
});

/**
 * Supervised check-in does not wait for the server.
 *
 * The session round trip used to sit in front of the Continue button, which on
 * the Apps Script deployment meant seconds of spinner before a screen that only
 * shows the voter their own name back.
 */
describe('check-in does not block on the session', () => {
  it('moves the voter on while the session is still in flight', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    // Never resolves for the lifetime of this test.
    mocks.selectVoter.mockReturnValue(new Promise(() => {}));

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));

    expect(await screen.findByRole('button', { name: /that.s me/i })).toBeInTheDocument();
  });

  it('goes from the name straight to "Voting as", with no card between', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099', voter: student });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));

    // One confirmation of who is voting, not two in a row.
    expect(await screen.findByRole('button', { name: /that.s me/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pick a different name/i })).not.toBeInTheDocument();
  });

  it('asks for the session as soon as the name is picked', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    mocks.selectVoter.mockReturnValue(new Promise(() => {}));

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));

    // The head start: requested while "Voting as" is still being read.
    expect(mocks.selectVoter).toHaveBeenCalledWith(student.id);
  });

  /*
    The roll the browser matched against can be stale - someone may have voted
    on another kiosk since it was fetched. The server's answer has to reach the
    voter wherever the flow has taken them.
  */
  it('stops a voter mid-flow when the session comes back refused', async () => {
    const user = userEvent.setup();
    mockRollFor(student);
    let refuse: (error: unknown) => void = () => {};
    mocks.selectVoter.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      }),
    );

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start voting/i }));
    await user.type(await screen.findByLabelText(/your name/i), 'One');
    await user.click(await screen.findByRole('button', { name: new RegExp(student.name, 'i') }));
    await screen.findByRole('button', { name: /that.s me/i });

    refuse(new ApiErrorCtor('ALREADY_VOTED', 'Our records show you have already voted.', 409));

    expect(await screen.findByText(HEADLINE.alreadyVoted)).toBeInTheDocument();
  });
});

/*
  Personal links: /voting/<voter_id>, sent to founders and leaders who vote
  from wherever they are rather than at a booth.
*/
describe('a personal link', () => {
  const openLink = (id: string) => window.history.pushState({}, '', `/voting/${id}`);

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('offers "Continue as <name>" and goes straight to the first contest', async () => {
    const user = userEvent.setup();
    openLink(employee.id);
    mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099', voter: employee });

    render(<App />);
    await user.click(
      await screen.findByRole('button', { name: new RegExp(`continue as ${employee.name}`, 'i') }),
    );

    // No search, no second "is this you": the link already said who.
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /that.s me/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText('1 of 6')).toBeInTheDocument();
    expect(mocks.selectVoter).toHaveBeenCalledWith(employee.id);
  });

  it('casts the vote with a session asked for at Continue, not at page load', async () => {
    const user = userEvent.setup();
    openLink(employee.id);
    mocks.selectVoter
      .mockResolvedValueOnce({ token: 'from-page-load', expiresAt: '2099', voter: employee })
      .mockResolvedValue({ token: 'from-continue', expiresAt: '2099', voter: employee });
    mocks.submitBallot.mockResolvedValue({
      status: 'recorded',
      receiptId: 'r1',
      replayed: false,
      submittedAt: 'now',
    });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /continue as/i }));
    await completeAllGates(user);
    await user.click(await screen.findByRole('button', { name: /confirm & submit vote/i }));
    await user.click(await screen.findByRole('button', { name: /cast my vote/i }));
    await screen.findByRole('heading', { name: 'Vote recorded' });

    // A link opened now and used an hour later must not carry an expired check-in.
    expect(mocks.submitBallot.mock.calls[0]![0]).toBe('from-continue');
  });

  it('stops someone who has already voted before they see a ballot', async () => {
    openLink(employee.id);
    mocks.selectVoter.mockRejectedValue(
      new ApiErrorCtor('ALREADY_VOTED', 'Our records show you have already voted.', 409),
    );

    render(<App />);
    expect(await screen.findByText(HEADLINE.alreadyVoted)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('says so plainly when the link matches nobody', async () => {
    openLink('emp_9999');
    mocks.selectVoter.mockRejectedValue(
      new ApiErrorCtor('NOT_ON_ROLL', "That name isn't on the roll for this election.", 404),
    );

    render(<App />);
    expect(await screen.findByText(COPY.error.badLink)).toBeInTheDocument();
  });

  it('falls back to the ordinary welcome when the reply is dropped', async () => {
    openLink(employee.id);
    mocks.selectVoter.mockRejectedValue(
      new ApiErrorCtor('UPSTREAM', 'We could not reach the election server.', 0),
    );

    render(<App />);
    expect(await screen.findByRole('button', { name: /start voting/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue as/i })).not.toBeInTheDocument();
  });

  it('keeps "Not you?" so the person holding the link can find their own name', async () => {
    const user = userEvent.setup();
    openLink(employee.id);
    mocks.selectVoter.mockResolvedValue({ token: 'tok', expiresAt: '2099', voter: employee });

    render(<App />);
    await screen.findByRole('button', { name: /continue as/i });
    await user.click(screen.getByRole('button', { name: /not you/i }));
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument();
  });

  it('leaves an ordinary visit to the ballot exactly as it was', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /start voting/i })).toBeInTheDocument();
    expect(mocks.selectVoter).not.toHaveBeenCalled();
  });
});
