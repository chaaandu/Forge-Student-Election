import { useState } from 'react';
import type { PublicElection } from '@/lib/api';
import { Composition3D } from '@/components/bauhaus/Composition3D';
import { CompositionSVG } from '@/components/bauhaus/CompositionSVG';
import { HouseMark } from '@/components/bauhaus/HouseMark';
import { Shape } from '@/components/bauhaus/Shape';
import { Button } from '@/components/ui/Button';

export interface WelcomeScreenProps {
  election: PublicElection;
  onCheckIn: () => void;
  isSeedData: boolean;
}

/**
 * The poster.
 *
 * A Bauhaus exhibition plate: a colour field carrying the title, a composition
 * of elementary forms, and one unmissable action. Asymmetric, gridded, cropped
 * by the frame.
 *
 * The composition below is a real SVG. It renders instantly, needs no WebGL,
 * and is what a reduced-motion voter sees; the 3D version fades in on top as
 * decoration. "Begin voting" is interactive from first paint either way.
 */
export function WelcomeScreen({ election, onCheckIn, isSeedData }: WelcomeScreenProps) {
  const [sceneReady, setSceneReady] = useState(false);
  const leadership = election.positions.filter((p) => p.kind === 'leadership');
  const houses = election.houses;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="panel panel--raised overflow-hidden">
        {/* Masthead: a black field, type reversed out of it. */}
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8"
          style={{ background: 'var(--color-ink)', color: 'var(--color-paper)' }}
        >
          <span className="label" style={{ color: 'var(--color-paper)' }}>
            Mesa School of Business
          </span>
          <span className="flex items-center gap-2">
            <Shape form="circle" size={12} color="var(--bh-yellow)" />
            <span className="label" style={{ color: 'var(--color-paper)' }}>
              Voting open
            </span>
          </span>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div className="grid items-stretch md:grid-cols-[1.05fr_1fr]">
            {/* Title block */}
            <div className="flex flex-col justify-center px-6 py-10 sm:px-8 sm:py-12">
              <h1
                className="poster"
                style={{ fontSize: 'var(--text-poster)', color: 'var(--color-ink)' }}
              >
                {election.election.name}
              </h1>

              <div className="bar mt-6" style={{ maxWidth: 220 }} />

              <p className="mt-6" style={{ fontSize: 'var(--text-md)', maxWidth: '34ch' }}>
                {leadership.length} leadership positions
                {houses.length > 0 ? ', plus your house captain' : ''}. About two minutes. You
                can change your choices right up until you submit.
              </p>

              <div className="mt-8">
                <Button variant="primary" size="lg" onClick={onCheckIn} autoFocus>
                  Begin voting <span aria-hidden="true">→</span>
                </Button>
              </div>
            </div>

            {/* Composition block */}
            <div
              className="relative min-h-[260px] border-t-[3px] border-[var(--color-ink)] md:min-h-0 md:border-l-[3px] md:border-t-0"
              style={{ background: 'var(--color-paper)' }}
            >
              <CompositionSVG
                className="absolute inset-0 h-full w-full"
                {...({} as Record<string, never>)}
              />
              <div
                className="absolute inset-0"
                style={{
                  opacity: sceneReady ? 1 : 0,
                  transition: 'opacity 600ms var(--ease-out)',
                  background: 'var(--color-paper)',
                }}
              >
                <Composition3D onReady={() => setSceneReady(true)} />
              </div>
            </div>
          </div>
        </div>

        {/* House strip: colour AND form, so identity never rests on colour. */}
        {houses.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-7 gap-y-3 px-6 py-5 sm:px-8"
            style={{ borderTop: 'var(--rule-weight) solid var(--color-ink)' }}
          >
            <span className="label">Houses</span>
            {houses.map((house) => (
              <HouseMark key={house.id} house={house} withName />
            ))}
          </div>
        )}
      </div>

      {isSeedData && (
        <div className="mt-6">
          <SeedDataBanner />
        </div>
      )}
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
      className="label mx-auto max-w-2xl px-5 py-3 text-center"
      style={{
        color: 'var(--color-ink)',
        background: 'var(--bh-yellow)',
        border: 'var(--rule-weight) solid var(--color-ink)',
        fontSize: 'var(--text-xs)',
      }}
    >
      Demo data — these are not the real candidates and no vote here counts
    </p>
  );
}
