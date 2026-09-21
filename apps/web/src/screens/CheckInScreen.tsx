import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type PublicElection, type RollMatch } from '@/lib/api';
import { Panel } from '@/components/bauhaus/Panel';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Tag } from '@/components/ui/Tag';
import { COPY } from '@/lib/copy';

export interface CheckInScreenProps {
  election: PublicElection;
  onIdentified: (voter: Awaited<ReturnType<typeof api.selectVoter>>) => void;
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
          : await api.selectVoter(voterId);
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
      <Panel raised className="overflow-hidden">
        <div
          className="px-6 py-6 sm:px-9"
          style={{
            background: 'var(--bh-blue)',
            color: '#FFFFFF',
            borderBottom: 'var(--rule-weight) solid var(--color-ink)',
          }}
        >
          <p className="label" style={{ color: '#FFFFFF', opacity: 0.75 }}>
            Check in
          </p>
          <h1 className="poster mt-1" style={{ fontSize: 'var(--text-xl)' }}>
            {mode === 'entra' ? 'Sign in with your Mesa account' : 'Find your name'}
          </h1>
        </div>

        <div className="flex flex-col gap-6 px-6 pb-8 pt-7 sm:px-9">
          {mode === 'entra' ? (
            <>
              <p style={{ color: 'var(--color-ink-soft)' }}>
                You will be sent to Microsoft to sign in, then brought straight back. We use your
                sign-in only to check you are on the voter roll and that you have not already
                voted.
              </p>
              <a
                href="/api/auth/entra/start"
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  minHeight: 'var(--hit)',
                  padding: '14px 28px',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--bh-yellow)',
                  color: 'var(--color-ink)',
                  border: '3px solid var(--color-ink)',
                  boxShadow: 'var(--shadow-block-sm)',
                  fontFamily: 'var(--font-geometric)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
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
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
                    Searching…
                  </p>
                )}

                {!searching && results?.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
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
                            background: 'var(--color-card)',
                            border: '3px solid var(--color-ink)',
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
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-soft)' }}
                            >
                              {match.maskedEmail}
                            </span>
                          </span>
                          <Tag>{match.type}</Tag>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <div>
            <Button variant="quiet" onClick={onBack}>
              Back
            </Button>
          </div>
        </div>
      </Panel>

      <style>{`
        .roll-match:hover { background: var(--bh-yellow); transform: translate(-2px,-2px); box-shadow: 4px 4px 0 var(--color-ink) }
        .roll-match { transition: transform 150ms var(--ease-snap), box-shadow 150ms var(--ease-snap), background-color 150ms }
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
          background: 'var(--color-sunk)',
          border: '3px solid var(--color-ink)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <Avatar name={match.name} />
        <div className="min-w-0 flex-1">
          <p style={{ fontWeight: 550 }}>{match.name}</p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-soft)' }}>
            {match.maskedEmail}
          </p>
        </div>
        <Tag>{match.type}</Tag>
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
          style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.24em' }}
        />
      ) : (
        error && (
          <p role="alert" style={{ color: 'var(--color-alert)', fontSize: 'var(--text-sm)' }}>
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
        <Button variant="quiet" onClick={onChangeName} type="button">
          Not you? Choose a different name
        </Button>
      </div>
    </form>
  );
}
