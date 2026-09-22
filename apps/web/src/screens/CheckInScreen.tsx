import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, rollSearchIsLocal, ApiError, type PublicElection, type RollMatch } from '@/lib/api';
import { Panel } from '@/components/bauhaus/Panel';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Tag } from '@/components/ui/Tag';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { roleFor } from '@/lib/color';
import { TYPE_FIELD } from '@/lib/voterType';
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
  const searchId = useRef(0);

  const mode = election.auth.mode;
  // The roll payload already carries houseId and nothing was reading it.
  const houseById = useMemo(
    () => new Map(election.houses.map((house) => [house.id, house])),
    [election.houses],
  );

  /*
    Fetch the roll while the voter is still reaching for the keyboard.

    Against Apps Script this is the whole of the search cost, paid once, in the
    seconds between the screen appearing and the first letter. Express does not
    need it and this is a no-op there. Failure is not surfaced: `api.lookup`
    falls back to asking the server per query.
  */
  useEffect(() => {
    if (mode === 'entra') return;
    void api.primeRoll();
  }, [mode]);

  useEffect(() => {
    /*
      Bumped FIRST, on every run, so anything still in flight is already stale
      by the time it answers — including when the voter deletes back below two
      characters or picks a name. Bumping it only for searches we start left
      the reply to "ab" free to repopulate a list the voter had just cleared.
    */
    const search = (searchId.current += 1);

    if (mode === 'entra' || chosen) return;
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    if (debounce.current) clearTimeout(debounce.current);

    /*
      A debounce paces a SERVER, and the roll is no longer on one.

      This was 650ms, because against Apps Script every keystroke started a
      multi-second request: several were in flight at once for a single name,
      their replies landed out of order, and the list flickered between answers
      to queries the voter had already finished typing. Waiting longer before
      paying that cost was the only lever available at the time.

      The cost itself is gone — the roll is fetched once above and matched in
      the browser, so a keystroke is now a filter over 145 names. What is left
      to pace is React, not Google. See `fetchRoll` in lib/api.
    */
    debounce.current = setTimeout(
      async () => {
        setSearching(true);
        setError(null);
        try {
          const response = await api.lookup(query.trim());
          // An older search must never overwrite a newer one. The debounce made
          // that unlikely; it never made it impossible, and a reply delayed
          // behind a retry can still land after the answer to a longer query.
          if (search !== searchId.current) return;
          setResults(response.results);
        } catch (searchError) {
          if (search !== searchId.current) return;
          setError(
            searchError instanceof ApiError && searchError.isNetwork
              ? COPY.error.network
              : "We couldn't search the roll. Try again, or ask the person running the election.",
          );
        } finally {
          if (search === searchId.current) setSearching(false);
        }
      },
      rollSearchIsLocal ? 60 : 220,
    );

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
            ? `${checkInError.message} ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`
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
    <div className="relative z-10 mx-auto w-full max-w-2xl">
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
                You'll sign in with Microsoft and come straight back. We only check that you're on
                the roll and haven't voted yet.
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
                placeholder="Type the first few letters"
                value={query}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
                {...(error ? { error } : {})}
              />

              <div aria-live="polite" className="min-h-2">
                {searching && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
                    Looking…
                  </p>
                )}

                {!searching && results?.length === 0 && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
                    {COPY.error.noMatch}
                  </p>
                )}

                {/*
                  ONE block with hairlines inside it, not eight blocks.

                  Every row used to be its own 3px keyline with a gap either
                  side, so a search returning eight names produced eight heavy
                  black boxes stacked up the screen. The heavy keyline is the
                  grammar for a PLATE — one object, bounded. Repeated down a
                  list it stops being structure and becomes noise, on the first
                  screen a voter meets after the landing page.

                  The right-hand slot carries the voter's HOUSE, with its crest,
                  rather than the word STUDENT. Eight rows that all said STUDENT
                  told a voter nothing and cost a tag each; a house is the thing
                  that actually separates two people with similar names, and it
                  is already public on the ballot. Anyone with no house — an
                  employee — keeps the type tag, which is then the exception it
                  is meant to be.
                */}
                {!searching && results && results.length > 0 && (
                  <ul className="roll list-none p-0">
                    {results.map((match) => {
                      const house = match.houseId ? houseById.get(match.houseId) : undefined;

                      return (
                        <li key={match.id}>
                          <button
                            type="button"
                            onClick={() => setChosen(match)}
                            className="roll-match flex w-full items-center gap-4 text-left"
                            style={
                              house
                                ? ({
                                    ['--row-house-brand']: roleFor(house.color).text,
                                  } as CSSProperties)
                                : undefined
                            }
                          >
                            <Avatar
                              name={match.name}
                              size="sm"
                              {...(house?.color ? { color: house.color } : {})}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate" style={{ fontWeight: 550 }}>
                                {match.name}
                              </span>
                              {/*
                                A name that has already been used is MARKED, not
                                blocked.

                                This is one of the three affordances supervised
                                mode rests on, and it was being fetched on every
                                search and then never drawn. It sits in the
                                sentence rather than in a block of its own,
                                because it is a fact about a row and not a
                                second identity competing with the house beside
                                it.

                                It stays clickable on purpose. The mark can be
                                seconds stale, and the binding refusal comes
                                from the server — so a row that is wrong about
                                this fails safe either way, where disabling it
                                would silently strand a voter who has not voted.
                              */}
                              <span
                                className="block truncate"
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  color: 'var(--row-ink-soft)',
                                }}
                              >
                                {match.hasVoted ? (
                                  <>
                                    <span
                                      style={{
                                        color: 'var(--row-voted-ink)',
                                        fontWeight: 650,
                                      }}
                                    >
                                      Already voted
                                    </span>
                                    {' \u00b7 '}
                                  </>
                                ) : null}
                                {match.maskedEmail}
                              </span>
                            </span>

                            {house ? (
                              <HouseCrest
                                house={house}
                                size={20}
                                withName
                                nameColor="var(--row-house-ink)"
                              />
                            ) : (
                              <Tag color={TYPE_FIELD[match.type]}>{match.type}</Tag>
                            )}
                          </button>
                        </li>
                      );
                    })}
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
        .roll {
          border: var(--rule-weight) solid var(--color-ink);
          background: var(--color-card);
        }
        .roll-match {
          width: 100%;
          min-height: var(--hit);
          padding: 12px 16px;
          background: transparent;
          border: 0;
          border-bottom: 2px solid var(--color-ink);
          cursor: pointer;
          transition: background-color 150ms;
        }
        /* The block's own keyline closes the last row. */
        .roll li:last-child .roll-match { border-bottom: 0 }
        /*
          EVERY COLOUR IN THE ROW COMES FROM A VARIABLE, so the hover can flip
          all of them at once.

          Hovering turns the row into a fixed yellow FIELD, and type on a fixed
          field takes fixed black — the same rule as the primary button. Without
          this the row kept the page's ink and the house's own text colour, both
          of which are lightened for a dark page: cream on yellow at 1.4:1 and a
          pale red house name on yellow. The whole row became unreadable exactly
          when a voter was pointing at it.

          The house name needs a variable rather than a CSS override because it
          is set as an inline style, which no stylesheet rule can outrank.
        */
        .roll-match {
          --row-ink: var(--color-ink);
          --row-ink-soft: var(--color-ink-soft);
          --row-house-ink: var(--row-house-brand, var(--color-ink-soft));
          --row-voted-ink: var(--color-alert);
          color: var(--row-ink);
        }
        .roll-match:hover {
          background: var(--bh-yellow);
          --row-ink: var(--color-ink-fixed);
          --row-ink-soft: var(--color-ink-fixed);
          --row-house-ink: var(--color-ink-fixed);
          --row-voted-ink: var(--color-ink-fixed);
        }
        /* Inside a bounded list there is nothing for a row to lift away from,
           so the hover is the field alone — no offset, no shadow. */
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
        <Tag color={TYPE_FIELD[match.type]}>{match.type}</Tag>
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
          hint="Six characters from your slip. Capitals don't matter."
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
          disabledReason="Enter the code from your slip."
        >
          Continue
        </Button>
        <Button variant="quiet" onClick={onChangeName} type="button">
          Pick a different name
        </Button>
      </div>
    </form>
  );
}
