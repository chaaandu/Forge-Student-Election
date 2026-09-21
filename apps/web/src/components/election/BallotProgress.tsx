import type { Position } from '@mesa/election-core';
import { InkMark } from '@/components/ink/InkMark';

export interface BallotProgressProps {
  steps: Position[];
  currentIndex: number;
  selections: Record<string, string>;
}

/**
 * How far down the ballot you are.
 *
 * A row of printed boxes, one per position *this voter* is eligible for —
 * marked as they are answered. An employee sees six boxes, never six of ten.
 * The boxes are decorative; the "3 of 7" beside them is the accessible version.
 */
export function BallotProgress({ steps, currentIndex, selections }: BallotProgressProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="label" style={{ color: 'var(--color-ink-soft)' }}>
        {currentIndex + 1} of {steps.length}
      </p>

      <ol aria-hidden="true" className="m-0 flex list-none items-center gap-1.5 p-0">
        {steps.map((step, index) => {
          const done = Boolean(selections[step.id]);
          const current = index === currentIndex;

          return (
            <li key={step.id} className="relative flex items-center justify-center">
              <span
                style={{
                  display: 'block',
                  width: 18,
                  height: 18,
                  borderRadius: 2,
                  border: `1.5px solid ${
                    current
                      ? 'var(--color-ink)'
                      : done
                        ? 'var(--color-mark)'
                        : 'var(--color-rule-strong)'
                  }`,
                  background: current ? 'var(--color-sheet-sunk)' : 'transparent',
                  transition: 'border-color 200ms var(--ease-paper)',
                }}
              />
              {done && (
                <span className="pointer-events-none absolute" style={{ transform: 'translateY(-1px)' }}>
                  <InkMark marked size="sm" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
