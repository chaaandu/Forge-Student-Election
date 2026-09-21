import type { HouseShape, Position } from '@mesa/election-core';
import { Shape } from '@/components/bauhaus/Shape';

export interface BallotProgressProps {
  steps: Position[];
  currentIndex: number;
  selections: Record<string, string>;
}

const FORMS: HouseShape[] = ['square', 'circle', 'triangle', 'arc'];
const FIELDS = ['var(--bh-red)', 'var(--bh-blue)', 'var(--bh-yellow)', 'var(--bh-green)'];

/**
 * Progress as a composition you build.
 *
 * One token per position *this voter* is eligible for. Answering a position
 * fills its form with colour, so the row assembles into a small Bauhaus
 * composition as the ballot is completed. An employee sees six tokens, never
 * six of ten.
 *
 * Forms cycle independently of colours, so no two adjacent tokens look alike
 * and the sequence stays legible without colour. The "3 of 7" beside it is the
 * accessible version; the tokens are decorative.
 */
export function BallotProgress({ steps, currentIndex, selections }: BallotProgressProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p
        className="label"
        style={{ color: 'var(--color-ink)', fontSize: 'var(--text-xs)', letterSpacing: '0.14em' }}
      >
        {currentIndex + 1} of {steps.length}
      </p>

      <ol aria-hidden="true" className="flex list-none items-center gap-2 p-0">
        {steps.map((step, index) => {
          const done = Boolean(selections[step.id]);
          const current = index === currentIndex;
          const form = FORMS[index % FORMS.length]!;
          const field = FIELDS[index % FIELDS.length]!;

          return (
            <li
              key={step.id}
              className={`bh-token ${current ? 'bh-token--current' : ''}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <Shape
                form={form}
                size={current ? 20 : 17}
                color={done ? field : 'var(--color-ink)'}
                outline={!done}
                strokeWidth={3}
              />
            </li>
          );
        })}
      </ol>

      <style>{`
        .bh-token { display: inline-flex; transition: transform var(--dur-snap) var(--ease-snap) }
        .bh-token--current { animation: token-pulse 1.9s var(--ease-out) infinite }
        @keyframes token-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.14) } }
        @media (prefers-reduced-motion: reduce) { .bh-token--current { animation: none } }
      `}</style>
    </div>
  );
}
