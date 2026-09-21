import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, ApiError, type CheckInResult } from '@/lib/api';
import { COPY, HEADLINE } from '@/lib/copy';
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
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = state.token;

  // --------------------------------------------------------- bootstrap ---
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const election = await api.election();
        if (cancelled) return;
        dispatch({ type: 'ELECTION_LOADED', election });

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
                  : 'Sign-in did not complete. Please try checking in again.',
              retryable: true,
            },
          });
          return;
        }

        if (handoff) {
          const result = await api.exchangeHandoff(handoff);
          if (!cancelled) dispatch({ type: 'IDENTIFIED', voter: result.voter, token: result.token });
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
                'This is a problem on our side, not yours. Please tell the person running the ' +
                'election.',
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
    dispatch({ type: 'RESET' });
  }, [clearDraft]);

  const handleIdentified = useCallback((result: CheckInResult) => {
    dispatch({ type: 'IDENTIFIED', voter: result.voter, token: result.token });
  }, []);

  const submit = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;

    // Generated once per ballot and kept for every retry. A fresh key on retry
    // would turn a timeout into a second vote.
    idempotencyRef.current ??= crypto.randomUUID();
    const key = idempotencyRef.current;

    dispatch({ type: 'SUBMIT_START', idempotencyKey: key });

    const send = async (tryNumber: number): Promise<void> => {
      setAttempt(tryNumber);
      try {
        const result = await api.submitBallot(token, state.selections, key);
        clearDraft();
        dispatch({ type: 'SUBMIT_SUCCESS', receiptId: result.receiptId });
      } catch (error) {
        // One automatic retry for a network blip — safe because the key is the
        // same, so a request that actually landed will replay, not duplicate.
        if (error instanceof ApiError && error.isNetwork && tryNumber === 1) {
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

  // ------------------------------------------------------------ render ---
  return (
    <div className="min-h-full px-4 py-6 sm:px-6 sm:py-10">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <main id="main" tabIndex={-1} className="outline-none">
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
            gateCount={state.steps.length}
            steps={state.steps}
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
              disabledReason="Every position needs a selection before you can submit."
            >
              {COPY.finalCall.cast}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 'var(--text-md)' }}>{COPY.finalCall.body}</p>
        <p className="mt-3" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Your {state.steps.length} selections will be submitted together.
        </p>
      </Dialog>
    </div>
  );
}
