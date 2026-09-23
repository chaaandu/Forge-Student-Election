import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, ApiError, type CheckInResult, type VoterProfile } from '@/lib/api';
import { COPY, HEADLINE } from '@/lib/copy';
import { voterIdFromPath } from '@/lib/voterLink';
import {
  currentStep,
  initialState,
  isComplete,
  reducer,
  type MachineError,
} from '@/machine/electionMachine';
import { Panel } from '@/components/bauhaus/Panel';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { GROUND } from '@/lib/ground';
import { AuroraBackdrop } from '@/components/backdrop/AuroraBackdrop';
import { WelcomeScreen, SeedDataBanner } from '@/screens/WelcomeScreen';
import { CheckInScreen } from '@/screens/CheckInScreen';
import { IdentityConfirmScreen } from '@/screens/IdentityConfirmScreen';
import { PositionScreen } from '@/screens/PositionScreen';
import { ReviewScreen } from '@/screens/ReviewScreen';
import { SubmittingScreen } from '@/screens/SubmittingScreen';
import { DoneScreen } from '@/screens/DoneScreen';

const CELEBRATION_SECONDS = Number(import.meta.env.VITE_CELEBRATION_SECONDS ?? 4);
/** A voter who walks away mid-ballot must not leave the kiosk on their screen. */
const IDLE_RESET_MS = 5 * 60_000;
const DRAFT_KEY = 'mesa.ballot.draft';

/** Map an API failure onto something a voter can read and act on. */
function toMachineError(error: unknown): MachineError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ALREADY_VOTED':
        return {
          code: error.code,
          headline: HEADLINE.alreadyVoted,
          message: COPY.error.alreadyVoted,
          retryable: false,
        };
      case 'ELECTION_CLOSED':
        return { code: error.code, headline: HEADLINE.closed, message: error.message, retryable: false };
      case 'ELECTION_NOT_STARTED':
        return { code: error.code, headline: HEADLINE.notOpen, message: error.message, retryable: false };
      case 'UNAUTHORIZED':
        return {
          code: error.code,
          headline: HEADLINE.checkInExpired,
          message: COPY.error.sessionExpired,
          retryable: false,
        };
      /*
        Taken off the roll, or on it with an entry that cannot be voted from.

        It fell through to the generic failure, which tells the voter their vote
        was not recorded and to try again. Trying again changes nothing: the
        answer is at the desk. The server's sentence says which of the two it
        is, and both end by saying who can fix it.
      */
      case 'NOT_ON_ROLL':
        return {
          code: error.code,
          headline: HEADLINE.checkInFailed,
          message: error.message || COPY.error.notOnRoll,
          retryable: false,
        };
      case 'NETWORK':
      case 'TIMEOUT':
        return {
          code: error.code,
          headline: HEADLINE.delayed,
          message: COPY.error.network,
          retryable: true,
        };
      case 'BALLOT_INVALID':
        return {
          code: error.code,
          headline: HEADLINE.checkBallot,
          // The server's message already explains what is wrong, in plain words.
          message: `${error.message} Nothing has been recorded.`,
          retryable: true,
        };
      default:
        return {
          code: error.code,
          headline: HEADLINE.notRecorded,
          message: `${COPY.error.submitFailed} (${error.code})`,
          retryable: error.isRetryable,
        };
    }
  }
  return {
    code: 'UNKNOWN',
    headline: HEADLINE.notRecorded,
    message: COPY.error.submitFailed,
    retryable: true,
  };
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [attempt, setAttempt] = useState(0);
  const idempotencyRef = useRef<string | null>(null);
  /*
    The check-in session, still in flight.

    Supervised check-in no longer waits for it: the voter moves on the instant
    they press Continue, and this promise is awaited once, at submission. See
    `handleIdentified`.
  */
  const sessionRef = useRef<Promise<CheckInResult> | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = state.token;
  /** Who is at the booth, so a dropped check-in can be asked for again. */
  const voterRef = useRef<VoterProfile | null>(null);
  voterRef.current = state.voter;

  /*
    Arrived by a personal link, /voting/<voter_id>.

    Read once, from the address the page was opened at. `voter` is filled in
    when the server confirms who the id belongs to; until then the welcome
    screen says it is finding their ballot. Cleared after a successful vote,
    so the screen that follows is the ordinary one.
  */
  const [personal, setPersonal] = useState<{ voterId: string; voter: VoterProfile | null } | null>(
    () => {
      const voterId = voterIdFromPath(window.location.pathname);
      return voterId ? { voterId, voter: null } : null;
    },
  );
  const personalIdRef = useRef(personal?.voterId ?? null);

  // --------------------------------------------------------- bootstrap ---
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const election = await api.election();
        if (cancelled) return;
        dispatch({ type: 'ELECTION_LOADED', election });

        /*
          Fetch the roll NOW, not when the check-in screen opens.

          It is one slow request, and the voter is about to spend several
          seconds reading the welcome screen and reaching for the keyboard.
          Spending those seconds on it means the search is already instant by
          the time anyone types. Started at check-in it raced the first
          keystroke, and usually lost.

          Not awaited, and failure is not surfaced: this only ever makes the
          search faster, and `api.lookup` answers without it.
        */
        void api.primeRoll();

        /*
          A personal link: ask who it is for before the voter has to.

          This is only the NAME for the button. The session the ballot is
          cast with is asked for again when they press Continue, because a
          link opened now and used an hour later would otherwise carry a
          check-in that had long since expired.

          A refusal is shown at once - they have already voted, or the link
          matches nobody - rather than after they have filled in a ballot. A
          dropped reply is not a refusal: the link quietly becomes the
          ordinary welcome screen, and they can find their name like anyone
          else.
        */
        const linkedId = personalIdRef.current;
        if (linkedId) {
          api.selectVoter(linkedId).then(
            (result) => {
              if (cancelled) return;
              if (result.voter.hasVoted) {
                setPersonal(null);
                dispatch({
                  type: 'FATAL',
                  error: {
                    code: 'ALREADY_VOTED',
                    headline: HEADLINE.alreadyVoted,
                    message: COPY.error.alreadyVoted,
                    retryable: false,
                  },
                });
                return;
              }
              setPersonal({ voterId: linkedId, voter: result.voter });
            },
            (error: unknown) => {
              if (cancelled) return;
              setPersonal(null);
              if (error instanceof ApiError && error.code === 'NOT_ON_ROLL') {
                dispatch({
                  type: 'FATAL',
                  error: {
                    code: error.code,
                    headline: HEADLINE.checkInFailed,
                    message: COPY.error.badLink,
                    retryable: false,
                  },
                });
                return;
              }
              if (error instanceof ApiError && !error.isNetwork) {
                dispatch({ type: 'FATAL', error: toMachineError(error) });
              }
            },
          );
        }

        /*
          The election is baked into the bundle, so the screen above drew
          without asking anyone. The one thing the bundle cannot know is that
          polling was closed after it was built, so ask - in the background,
          where a slow or dropped reply costs the voter nothing.

          The reducer applies this only before anyone has started voting.
        */
        if (api.electionIsBaked) {
          void api
            .electionFresh()
            .then((fresh) => {
              if (!cancelled) dispatch({ type: 'ELECTION_LOADED', election: fresh });
            })
            .catch(() => undefined);
        }

        // Returning from Microsoft: exchange the one-time handoff code for a
        // session. The session token itself is never placed in a URL.
        const params = new URLSearchParams(window.location.search);
        const handoff = params.get('checkin');
        const checkinError = params.get('checkin_error');
        if (handoff || checkinError) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        if (checkinError) {
          dispatch({
            type: 'FATAL',
            error: {
              code: checkinError,
              headline: HEADLINE.checkInFailed,
              message:
                checkinError === 'NOT_ON_ROLL'
                  ? COPY.error.notOnRoll
                  : "Sign-in didn't finish. Try checking in again.",
              retryable: true,
            },
          });
          return;
        }

        if (handoff) {
          const result = await api.exchangeHandoff(handoff);
          if (!cancelled) {
            sessionRef.current = Promise.resolve(result);
            dispatch({ type: 'IDENTIFIED', voter: result.voter, token: result.token });
          }
        }
      } catch (error) {
        // Logged for the returning officer's benefit on election day; the voter
        // gets the plain sentence below. Nothing sensitive reaches this path.
        console.error('[mesa] could not start the election session', error);
        if (!cancelled) {
          dispatch({
            type: 'FATAL',
            error: {
              code: 'ELECTION_UNAVAILABLE',
              headline: HEADLINE.unavailable,
              message:
                "This is on us, not you. Tell the person running the election.",
              retryable: true,
            },
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------- draft persistence (UX only) ---
  // sessionStorage holds an in-progress ballot so a refresh or a flaky network
  // does not cost the voter their work. It is NEVER authoritative: the server
  // decides what was cast. Cleared the moment the journey ends.
  useEffect(() => {
    if (!state.voter || state.phase === 'DEPARTED') return;
    if (Object.keys(state.selections).length === 0) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ voterId: state.voter.id, selections: state.selections }),
      );
    } catch {
      // A kiosk with storage disabled still votes fine; the draft is a nicety.
    }
  }, [state.selections, state.voter, state.phase]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // ------------------------------------------------------- idle reset ---
  useEffect(() => {
    const active = state.phase !== 'WELCOME' && state.phase !== 'LOADING' && state.phase !== 'DEPARTED';
    if (!active) return;

    let timer = setTimeout(handleReset, IDLE_RESET_MS);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(handleReset, IDLE_RESET_MS);
    };

    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ------------------------------------------------- browser back guard ---
  // The flow is a state machine, not a set of URLs (ADR-6), but the Back button
  // must still mean something sensible. We keep one spare history entry and map
  // popstate onto the machine's BACK transition.
  useEffect(() => {
    window.history.pushState({ mesa: true }, '');
    const onPopState = () => {
      window.history.pushState({ mesa: true }, '');
      dispatch({ type: 'BACK' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ---------------------------------------------------------- handlers ---
  const handleReset = useCallback(() => {
    clearDraft();
    idempotencyRef.current = null;
    setAttempt(0);
    const token = tokenRef.current;
    if (token) void api.endSession(token).catch(() => undefined);
    sessionRef.current = null;
    dispatch({ type: 'RESET' });
  }, [clearDraft]);

  const handleIdentified = useCallback(
    ({ voter, session }: { voter: VoterProfile; session: Promise<CheckInResult> | null }) => {
      sessionRef.current = session;
      dispatch({ type: 'IDENTIFIED', voter, token: null });

      /*
        A refusal has to find the voter wherever they have got to.

        The session request is no longer in front of the Continue button, so
        its answer arrives while they are confirming their name or partway
        through the gates. ALREADY_VOTED is the one that matters, and it can
        come back two ways: as a rejection, or as a profile that simply says
        so. Both have to stop them there rather than waiting until they have
        filled in a ballot that was never going to count.

        This is also what covers a STALE ROLL. The copy the browser matched
        against may have been fetched before someone voted on another kiosk;
        it can only ever miss a new vote, never invent one, so the server's
        answer is the one that corrects it.
      */
      session?.then(
        (result) => {
          if (!result.voter.hasVoted) return;
          dispatch({
            type: 'FATAL',
            error: {
              code: 'ALREADY_VOTED',
              headline: HEADLINE.alreadyVoted,
              message: COPY.error.alreadyVoted,
              retryable: false,
            },
          });
        },
        (error: unknown) => {
          /*
            A DROPPED CHECK-IN MUST NOT DESTROY A FILLED-IN BALLOT.

            This dispatched FATAL for every failure, and FATAL is unguarded by
            phase - so a check-in whose reply never arrived threw the voter out
            of wherever they had got to onto a full-screen panel whose only
            button starts the ballot again. The panel said "Nothing is lost.
            Your choices are still on this screen"; the one thing the voter
            could do next discarded them.

            A refusal still has to stop them there: ALREADY_VOTED, NOT_ON_ROLL
            and NOT_ELIGIBLE are answers, and carrying on would fill in a ballot
            that was never going to count. A network failure is not an answer.
            So it is dropped here and re-asked at submission, where `submit`
            surfaces it on the review screen with every selection intact.
          */
          if (error instanceof ApiError && error.isNetwork) {
            sessionRef.current = null;
            return;
          }
          dispatch({ type: 'FATAL', error: toMachineError(error) });
        },
      );
    },
    [],
  );

  /*
    "Continue as Varun": the name was confirmed by the link, so this is the
    identity confirmation too - it goes straight to the first contest.

    A fresh session is asked for here rather than reusing the one fetched to
    draw the button (see the bootstrap), through the same path the booth uses,
    so a refusal or a dropped reply is handled exactly as it is there.
  */
  const handlePersonalContinue = useCallback(() => {
    if (!personal?.voter) return;
    const session = api.selectVoter(personal.voterId);
    session.catch(() => undefined);
    handleIdentified({ voter: personal.voter, session });
    dispatch({ type: 'CONFIRM_IDENTITY' });
  }, [personal, handleIdentified]);

  const submit = useCallback(async () => {
    // Generated once per ballot and kept for every retry. A fresh key on retry
    // would turn a timeout into a second vote.
    idempotencyRef.current ??= crypto.randomUUID();
    const key = idempotencyRef.current;

    /*
      SUBMIT_START FIRST, before anything that can fail.

      Resolving the session used to happen above this line, and a failure there
      returned early - after which `SUBMIT_FAILED` is ignored, because the
      machine only accepts it from SUBMITTING. The voter pressed "Cast my vote"
      and nothing at all happened. Entering SUBMITTING first means every failure
      below has somewhere to land.
    */
    dispatch({ type: 'SUBMIT_START', idempotencyKey: key });

    /*
      The one place the session is actually needed.

      By now it has been in flight since the voter picked their name, through
      the confirmation screen and every gate, so this almost always returns
      immediately. When it was dropped instead, it is asked again here rather
      than being treated as fatal - check-in writes nothing, so re-asking is
      free, and this is the moment the voter is expecting something to happen.
    */
    const resolveToken = async (): Promise<string> => {
      if (tokenRef.current) return tokenRef.current;
      if (!sessionRef.current) {
        const voterId = voterRef.current?.id;
        if (!voterId) {
          throw new ApiError('UNAUTHORIZED', COPY.error.sessionExpired, 401);
        }
        sessionRef.current = api.selectVoter(voterId);
        sessionRef.current.catch(() => undefined);
      }
      return (await sessionRef.current).token;
    };

    const send = async (tryNumber: number): Promise<void> => {
      setAttempt(tryNumber);
      try {
        const token = await resolveToken();
        const result = await api.submitBallot(token, state.selections, key);
        clearDraft();
        // The link has done its job; whoever uses this screen next gets the
        // ordinary welcome, not a button with somebody else's name on it.
        setPersonal(null);
        dispatch({ type: 'SUBMIT_SUCCESS', receiptId: result.receiptId });
      } catch (error) {
        // One automatic retry for a network blip — safe because the key is the
        // same, so a request that actually landed will replay, not duplicate.
        if (error instanceof ApiError && error.isNetwork && tryNumber === 1) {
          // A rejected promise stays rejected. Cleared so the retry asks the
          // server again instead of re-reading the same failure.
          if (!tokenRef.current) sessionRef.current = null;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return send(2);
        }
        dispatch({ type: 'SUBMIT_FAILED', error: toMachineError(error) });
      }
    };

    await send(1);
  }, [state.selections, clearDraft]);

  // ------------------------------------------------------------ lookups ---
  const candidateById = useMemo(
    () => new Map((state.election?.candidates ?? []).map((c) => [c.id, c])),
    [state.election],
  );
  const houseById = useMemo(
    () => new Map((state.election?.houses ?? []).map((h) => [h.id, h])),
    [state.election],
  );

  const step = currentStep(state);
  const stepHouse = step?.houseId ? houseById.get(step.houseId) : undefined;
  const voterHouse = state.voter?.houseId ? houseById.get(state.voter.houseId) : undefined;
  const isSeedData = state.election?.election.isSeedData === true;

  // The welcome screen is the one full-bleed screen. Its dark scene was being
  // rendered INSIDE the page's cream padding, so a turning sheet in a dark room
  // sat in a cream picture frame — which reads as a rendering fault, not as a
  // choice, and made the jump to the light ballot a discontinuity rather than a
  // transition. Everything else keeps the frame.
  const isWelcome = state.phase === 'WELCOME';

  /*
    The handoff out of the dark room.

    Welcome is a dark full-bleed scene and the ballot is cream paper, and the
    change between them was a CUT — one frame black, the next frame cream. The
    two worlds are deliberate (see docs/design-direction.md §5) but a hard cut
    makes them read as two different applications rather than as one moving from
    the room onto the page.

    So the dark ground stays for a beat and lifts. It is a fixed overlay with no
    pointer events, mounted only on the way out of welcome and unmounted by its
    own animationend — nothing about the ballot depends on it, and it cannot
    swallow a tap on the screen underneath.
  */
  const [liftingGround, setLiftingGround] = useState(false);
  const cameFromWelcome = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (state.phase === 'WELCOME') {
      cameFromWelcome.current = true;
      return;
    }
    if (!cameFromWelcome.current) return;
    cameFromWelcome.current = false;
    /*
      Only on paper, and only with motion.

      The lift exists to soften a hard cut from the dark welcome scene to a
      cream ballot. On the night ground there is no cut to soften — the ballot
      is already the same world the welcome screen is in — so holding a dark
      overlay over a dark screen would be half a second of nothing, on the one
      screen that should be immediately usable.
    */
    if (!reducedMotion && GROUND === 'paper') setLiftingGround(true);
  }, [state.phase, reducedMotion]);

  // ------------------------------------------------------------ render ---
  return (
    /*
      Equal padding on all four sides, and the page is a flex column filling the
      viewport. An earlier version used `px-4 py-6 sm:px-6 sm:py-10` (24px sides
      against 40px top and bottom) with the welcome screen sized by
      `calc(100vh - 3rem)` — a 48px allowance against 80px of actual padding. So
      the frame was uneven AND overflowed by 32px, which ate the bottom margin.
      Letting the child grow with `flex-1` removes the magic number entirely.
    */
    <div className={`flex min-h-screen flex-col ${isWelcome ? '' : 'p-4 sm:p-6'}`}>
      {/*
        The aurora runs on every screen EXCEPT the welcome one.

        Welcome already has a world: a turning sheet in a dark room, its own
        WebGL scene. Two shaders on one screen is two light sources arguing, and
        it would double the cost of the only screen that has to be interactive
        from first paint. Everything after it is a plate on an empty page, which
        is exactly what this was for.
      */}
      {!isWelcome && <AuroraBackdrop />}

      {liftingGround && (
        <div
          className="ground-lift"
          aria-hidden="true"
          onAnimationEnd={() => setLiftingGround(false)}
        />
      )}

      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      {/*
        `page-main` centres the plate vertically instead of hanging it from the
        top. The identity pass filled the top 45% of a 1440x900 screen and left
        55% empty cream below it, which read as an unfinished page rather than
        as whitespace. It centres SAFELY — a plate taller than the window still
        starts at the top, so nothing is ever scrolled off above the viewport.
      */}
      <main id="main" tabIndex={-1} className="page-main relative z-10 flex flex-1 flex-col outline-none">
        {state.phase === 'LOADING' && (
          <div className="mx-auto w-full max-w-lg">
            <Panel>
              <div className="px-7 py-16 text-center">
                <p className="label">Mesa School of Business</p>
                <p className="mt-4" style={{ color: 'var(--color-ink-soft)' }}>
                  Preparing the ballot…
                </p>
              </div>
            </Panel>
          </div>
        )}

        {state.phase === 'BLOCKED' && state.error && (
          <div className="flex flex-col gap-6">
            <ErrorState
              headline={state.error.headline}
              message={state.error.message}
              action={{ label: 'Start again', onClick: handleReset }}
            />
            {isSeedData && <SeedDataBanner />}
          </div>
        )}

        {state.phase === 'WELCOME' && state.election && (
          <WelcomeScreen
            election={state.election}
            onCheckIn={() => dispatch({ type: 'BEGIN_CHECK_IN' })}
            isSeedData={isSeedData}
            {...(personal
              ? {
                  personal: {
                    name: personal.voter?.name ?? null,
                    onContinue: handlePersonalContinue,
                  },
                }
              : {})}
          />
        )}

        {state.phase === 'CHECK_IN' && state.election && (
          <CheckInScreen
            election={state.election}
            onIdentified={handleIdentified}
            onBack={() => dispatch({ type: 'BACK' })}
          />
        )}

        {state.phase === 'IDENTITY_CONFIRM' && state.voter && (
          <IdentityConfirmScreen
            voter={state.voter}
            {...(voterHouse ? { house: voterHouse } : {})}
            onConfirm={() => dispatch({ type: 'CONFIRM_IDENTITY' })}
            onStartOver={handleReset}
          />
        )}

        {state.phase === 'GATE' && step && (
          <PositionScreen
            step={step}
            steps={state.steps}
            gateIndex={state.gateIndex}
            candidates={(state.election?.candidates ?? []).filter((c) => c.positionId === step.id)}
            selections={state.selections}
            {...(stepHouse ? { house: stepHouse } : {})}
            houseById={houseById}
            direction={state.direction}
            isEditing={state.returnToReview}
            onSelect={(candidateId: string) =>
              dispatch({ type: 'SELECT', positionId: step.id, candidateId })
            }
            onNext={() => dispatch({ type: 'NEXT' })}
            onBack={() => dispatch({ type: 'BACK' })}
          />
        )}

        {(state.phase === 'REVIEW' || state.phase === 'FINAL_CALL') && state.voter && (
          <div className="flex flex-col gap-6">
            {state.error && (
              <ErrorState
                headline={state.error.headline}
                message={state.error.message}
                {...(state.error.retryable
                  ? { action: { label: 'Try again', onClick: () => dispatch({ type: 'OPEN_FINAL_CALL' }) } }
                  : {})}
                secondaryAction={{
                  label: 'Dismiss',
                  onClick: () => dispatch({ type: 'DISMISS_ERROR' }),
                }}
              />
            )}

            <ReviewScreen
              voter={state.voter}
              steps={state.steps}
              selections={state.selections}
              candidateById={candidateById}
              houseById={houseById}
              onEdit={(positionId) => dispatch({ type: 'EDIT', positionId })}
              onSubmit={() => dispatch({ type: 'OPEN_FINAL_CALL' })}
              onBack={() => dispatch({ type: 'BACK' })}
            />
          </div>
        )}

        {state.phase === 'SUBMITTING' && <SubmittingScreen attempt={attempt} />}

        {state.phase === 'DEPARTED' && (
          <DoneScreen holdSeconds={CELEBRATION_SECONDS} onFinished={handleReset} />
        )}
      </main>

      <Dialog
        open={state.phase === 'FINAL_CALL'}
        title={COPY.finalCall.title}
        onClose={() => dispatch({ type: 'CLOSE_FINAL_CALL' })}
        actions={
          <>
            {/* "Go back" is first, so it takes focus: the safe action is the default. */}
            <Button variant="secondary" size="lg" onClick={() => dispatch({ type: 'CLOSE_FINAL_CALL' })}>
              {COPY.finalCall.goBack}
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void submit()}
              disabled={!isComplete(state)}
              disabledReason="Pick someone for every position first."
            >
              {COPY.finalCall.cast}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 'var(--text-md)' }}>{COPY.finalCall.body}</p>
        <p className="mt-3" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          All {state.steps.length} choices go in together.
        </p>
      </Dialog>
    </div>
  );
}
