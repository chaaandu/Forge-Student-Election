import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type PublicElection, type RollMatch } from '@/lib/api';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Tag } from '@/components/ui/Tag';
import { COPY, BOARD } from '@/lib/copy';

export interface CheckInScreenProps {
  election: PublicElection;
  onIdentified: (voter: Awaited<ReturnType<typeof api.devCheckIn>>) => void;
  onBack: () => void;
}

/**
 * The check-in desk.
 *
 * With Entra, identity is *discovered*: one button, then Microsoft. With access
 * codes, the voter finds their name (navigation) and then proves it with a code
 * handed over in person (authentication). Choosing a name is never, by itself,
 * enough to be issued a session.
 */
export function CheckInScreen({ election, onIdentified, onBack }: CheckInScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RollMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<RollMatch | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode = election.auth.mode;

  useEffect(() => {
    if (mode === 'entra' || chosen) return;
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await api.lookup(query.trim());
        setResults(response.results);
      } catch (searchError) {
        setError(
          searchError instanceof ApiError && searchError.isNetwork
            ? COPY.error.network
            : 'We could not search the roll just now. Please try again, or see the returning officer.',
        );
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, mode, chosen]);

  async function identify(voterId: string, accessCode?: string) {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'access-code'
          ? await api.verifyCode(voterId, accessCode ?? '')
          : await api.devCheckIn(voterId);
      onIdentified(result);
    } catch (checkInError) {
      if (checkInError instanceof ApiError) {
        const remaining = (checkInError.details as { attemptsRemaining?: number } | undefined)
          ?.attemptsRemaining;
        setError(
          remaining !== undefined
            ? `${checkInError.message} ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left before this pauses.`
            : checkInError.message,
        );
      } else {
        setError(COPY.error.network);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BoardPanel>
        <div className="px-5 pt-7 sm:px-8">
          <SplitFlap text={BOARD.checkIn} size="lg" tone="signal" announce />
          <h1 className="mt-4" style={{ fontSize: 'var(--text-xl)', fontWeight: 650 }}>
            {mode === 'entra' ? 'Sign in with your Mesa account' : 'Find your name'}
          </h1>
        </div>

        <div className="flex flex-col gap-6 px-5 pb-8 pt-6 sm:px-8">
          {mode === 'entra' ? (
            <>
              <p style={{ color: 'var(--color-text-muted)' }}>
                You will be sent to Microsoft to sign in, then brought straight back. We use your
                sign-in only to check you are on the voter roll and that you have not already
                voted.
              </p>
              <a
                href="/api/auth/entra/start"
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  minHeight: 'var(--hit)',
                  padding: '16px 28px',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--color-signal)',
                  color: 'var(--color-signal-ink)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-md)',
                }}
              >
                Check in with your Mesa account
              </a>
            </>
          ) : chosen ? (
            <CodeStep
              match={chosen}
              code={code}
              setCode={setCode}
              error={error}
              busy={busy}
              requiresCode={mode === 'access-code'}
              onSubmit={() => identify(chosen.id, code)}
              onChangeName={() => {
                setChosen(null);
                setCode('');
                setError(null);
              }}
            />
          ) : (
            <>
              <TextField
                label="Your name"
                placeholder="Start typing your name…"
                value={query}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
                hint="Type at least two letters. We only show a few matches at a time."
                {...(error ? { error } : {})}
              />

              <div aria-live="polite" className="min-h-2">
                {searching && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    Searching…
                  </p>
                )}

                {!searching && results?.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    {COPY.error.noMatch}
                  </p>
                )}

                {!searching && results && results.length > 0 && (
                  <ul className="flex list-none flex-col gap-2 p-0">
                    {results.map((match) => (
                      <li key={match.id}>
                        <button
                          type="button"
                          onClick={() => setChosen(match)}
                          className="roll-match flex w-full items-center gap-4 text-left"
                          style={{
                            minHeight: 'var(--hit)',
                            padding: '12px 16px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-line)',
                            borderRadius: 'var(--radius-control)',
                          }}
                        >
                          <Avatar name={match.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" style={{ fontWeight: 550 }}>
                              {match.name}
                            </span>
                            <span
                              className="block truncate"
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                            >
                              {match.maskedEmail}
                            </span>
                          </span>
                          {/* eligibility-branch-ok: tag colour only, not an election rule */}
                          <Tag tone={match.type === 'student' ? 'signal' : 'brand'}>
                            {match.type}
                          </Tag>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <div>
            <Button variant="ghost" onClick={onBack}>
              ← Back to the board
            </Button>
          </div>
        </div>
      </BoardPanel>

      <style>{`
        .roll-match:hover { background: var(--color-surface-hi); border-color: var(--color-text-dim); }
      `}</style>
    </div>
  );
}

function CodeStep({
  match,
  code,
  setCode,
  error,
  busy,
  requiresCode,
  onSubmit,
  onChangeName,
}: {
  match: RollMatch;
  code: string;
  setCode: (value: string) => void;
  error: string | null;
  busy: boolean;
  requiresCode: boolean;
  onSubmit: () => void;
  onChangeName: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div
        className="flex items-center gap-4 p-4"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <Avatar name={match.name} />
        <div className="min-w-0 flex-1">
          <p style={{ fontWeight: 550 }}>{match.name}</p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {match.maskedEmail}
          </p>
        </div>
        {/* eligibility-branch-ok: tag colour only, not an election rule */}
        <Tag tone={match.type === 'student' ? 'signal' : 'brand'}>{match.type}</Tag>
      </div>

      {requiresCode ? (
        <TextField
          label="Your access code"
          placeholder="e.g. K7M2PQ"
          value={code}
          autoFocus
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={12}
          spellCheck={false}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          hint="The six characters on the slip you were given. Letter case does not matter."
          {...(error ? { error } : {})}
          style={{ fontFamily: 'var(--font-board)', letterSpacing: '0.24em' }}
        />
      ) : (
        error && (
          <p role="alert" style={{ color: 'var(--color-stop)', fontSize: 'var(--text-sm)' }}>
            {error}
          </p>
        )
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={busy}
          disabled={requiresCode && code.trim().length < 4}
          disabledReason="Enter the access code from your slip to continue."
        >
          Continue
        </Button>
        <Button variant="ghost" onClick={onChangeName} type="button">
          Not you? Choose a different name
        </Button>
      </div>
    </form>
  );
}
