import { useState } from 'react';
import type { PublicElection } from '@/lib/api';
import { PaperBackdrop } from '@/components/paper/PaperBackdrop';
import { CompositionSVG } from '@/components/bauhaus/CompositionSVG';
import { Shape } from '@/components/bauhaus/Shape';
import { Button } from '@/components/ui/Button';

export interface WelcomeScreenProps {
  election: PublicElection;
  onCheckIn: () => void;
  isSeedData: boolean;
}

/**
 * The welcome screen: two worlds, joined.
 *
 * Outside the ballot it is the ThreeUI paper — a dark room with a single
 * translucent sheet turning in it. The moment a voter checks in, everything
 * becomes the light Bauhaus plates. The transition from one to the other is the
 * point: you step out of the atmosphere and into the form.
 *
 * The backdrop is decoration and carries no meaning: it is `aria-hidden`, never
 * loaded under reduced motion, and the panel below works identically without
 * it. "Begin voting" is interactive from first paint.
 */
export function WelcomeScreen({ election, onCheckIn, isSeedData }: WelcomeScreenProps) {
  const [backdropReady, setBackdropReady] = useState(false);
  const leadership = election.positions.filter((p) => p.kind === 'leadership');
  const hasHouseContests = election.positions.some((p) => p.kind === 'house-captain');

  return (
    // `flex-1`, not a viewport calc: the page is a flex column with equal
    // padding, so the panel simply fills what is left. Nothing to keep in sync.
    <div className="welcome relative flex w-full flex-1 flex-col overflow-hidden">
      {/* Static artwork first, so the screen is never empty or white. */}
      <div
        className="absolute inset-0"
        style={{
          background: '#08080a',
          opacity: backdropReady ? 0 : 1,
          transition: 'opacity 600ms ease-out',
        }}
        aria-hidden="true"
      >
        <CompositionSVG tone="dark" className="h-full w-full opacity-40" />
      </div>

      <PaperBackdrop className="absolute inset-0" onReady={() => setBackdropReady(true)} />

      {/* Everything below is the real, readable screen. */}
      <div className="relative flex flex-1 flex-col justify-between gap-8 p-4 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-end gap-1.5">
            <Shape form="square" size={14} color="var(--bh-red)" />
            <Shape form="circle" size={14} color="var(--bh-blue)" />
            <Shape form="triangle" size={14} color="var(--bh-yellow)" />
          </span>
          <span
            className="label"
            style={{ color: 'rgba(242,237,225,.55)', fontSize: 'var(--text-2xs)' }}
          >
            Mesa School of Business
          </span>
        </div>

        <div className="max-w-xl lg:max-w-[46%]">
          <div className="panel panel--raised overflow-hidden">
            <div
              className="px-6 py-3 sm:px-8"
              style={{ background: 'var(--color-ink)', color: 'var(--color-paper)' }}
            >
              <span className="label" style={{ color: 'var(--bh-yellow)' }}>
                Voting open
              </span>
            </div>

            <div className="px-6 py-7 sm:px-8">
              <h1 className="poster" style={{ fontSize: 'clamp(2.25rem, 7vw, 4rem)' }}>
                {election.election.name}
              </h1>

              <div className="bar mt-5" style={{ maxWidth: 180 }} />

              <p className="mt-5" style={{ fontSize: 'var(--text-md)', maxWidth: '38ch' }}>
                {leadership.length} leadership positions
                {hasHouseContests ? ', plus your house captain' : ''}. Two minutes, give or
                take — and you can change your mind right up until you submit.
              </p>

              <div className="mt-7">
                <Button variant="primary" size="lg" onClick={onCheckIn} autoFocus>
                  Start voting <span aria-hidden="true">→</span>
                </Button>
              </div>
            </div>
          </div>

          {isSeedData && (
            <div className="mt-5">
              <SeedDataBanner />
            </div>
          )}
        </div>

        {/*
          No house strip here. The four crests are printed on the ballot sheet
          itself, and repeating them along the foot of the screen competed with
          it for attention without telling a voter anything new — houses are
          named again at the house contest, where they matter.
        */}
      </div>
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
      className="label px-5 py-3 text-center"
      style={{
        color: 'var(--color-ink)',
        background: 'var(--bh-yellow)',
        border: 'var(--rule-weight) solid var(--color-ink)',
        fontSize: 'var(--text-xs)',
      }}
    >
      Practice run — these are not the real candidates, and nothing here counts
    </p>
  );
}
