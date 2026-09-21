import { useState } from 'react';
import type { PublicElection } from '@/lib/api';
import { BallotSheet3D } from '@/components/paper/BallotSheet3D';
import { InkMark } from '@/components/ink/InkMark';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';

export interface WelcomeScreenProps {
  election: PublicElection;
  onCheckIn: () => void;
  isSeedData: boolean;
}

/**
 * The ballot, waiting on the desk.
 *
 * The printed sheet below is real HTML: it is what a screen reader reads, what
 * renders without WebGL, and what a voter who prefers reduced motion sees. The
 * 3D sheet fades in on top of it purely as decoration, and is never required
 * for anything. The CTA works from the first paint either way.
 */
export function WelcomeScreen({ election, onCheckIn, isSeedData }: WelcomeScreenProps) {
  const [sheetReady, setSheetReady] = useState(false);
  const leadership = election.positions
    .filter((p) => p.kind === 'leadership')
    .sort((a, b) => a.order - b.order);
  const houseCount = election.positions.filter((p) => p.kind === 'house-captain').length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-9">
      <div
        className="relative w-full"
        style={{ aspectRatio: '1024 / 724', maxHeight: '58vh' }}
      >
        {/* The real, readable sheet. */}
        <div
          className="sheet absolute inset-0 flex flex-col items-center justify-center px-6 py-8 text-center"
          style={{
            opacity: sheetReady ? 0 : 1,
            transition: 'opacity 700ms var(--ease-paper)',
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{ inset: 18, border: '1px solid var(--color-rule)', borderRadius: 4 }}
          />
          <p className="label">Mesa School of Business</p>

          <h1
            className="mt-5"
            style={{ fontSize: 'clamp(2rem, 6.5vw, 3.5rem)', letterSpacing: '-0.02em' }}
          >
            {election.election.name}
          </h1>

          <p className="mt-3" style={{ color: 'var(--color-ink-soft)' }}>
            One ballot. {leadership.length} positions
            {houseCount > 0 ? ', plus your house captain' : ''}.
          </p>

          <hr className="rule mt-6 w-40" />

          {/* A few ballot lines, one already marked: the sheet shows you what to do. */}
          <ul aria-hidden="true" className="mt-6 flex list-none flex-col gap-2.5 p-0">
            {leadership.slice(0, 4).map((position, index) => (
              <li key={position.id} className="flex items-center gap-3">
                <span
                  className="relative flex items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 2,
                    border: '1.5px solid var(--color-rule-strong)',
                  }}
                >
                  {index === 1 && (
                    <span className="absolute" style={{ transform: 'translateY(-1px)' }}>
                      <InkMark marked size="sm" />
                    </span>
                  )}
                </span>
                <span
                  style={{
                    width: `${120 - index * 14}px`,
                    height: 2,
                    background: 'var(--color-rule)',
                    borderRadius: 1,
                  }}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* Decoration only. Never required, never blocking. */}
        <BallotSheet3D
          title={election.election.name}
          subtitle={`${leadership.length} positions${houseCount > 0 ? ' + house captain' : ''}`}
          footer="OFFICIAL BALLOT"
          onReady={() => setSheetReady(true)}
        />
      </div>

      <div className="flex flex-col items-center gap-5">
        <Button variant="primary" size="lg" onClick={onCheckIn} autoFocus>
          Begin voting
        </Button>

        <p
          className="max-w-md text-center text-balance"
          style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}
        >
          It takes about two minutes. You can change your choices right up until you submit.
          {houseCount > 0 &&
            ' Students also vote for their own house captain; employees vote for the leadership positions.'}
        </p>

        <Wordmark />
      </div>

      {isSeedData && <SeedDataBanner />}
    </div>
  );
}

/**
 * The banner warns about demo data, not about the check-in mode.
 *
 * Supervised check-in is a deliberate operating choice and needs no alarm on a
 * voter's screen. Voting on fake candidates is the state that must never pass
 * unnoticed.
 */
export function SeedDataBanner() {
  return (
    <p
      role="status"
      className="label mx-auto max-w-xl px-4 py-3 text-center"
      style={{
        color: 'var(--color-alert)',
        background: 'var(--color-alert-wash)',
        border: '1px solid var(--color-alert)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      Demo data — these are not the real candidates and no vote here counts
    </p>
  );
}
