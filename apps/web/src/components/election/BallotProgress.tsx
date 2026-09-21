import type { House, Position } from '@mesa/election-core';
import { InkMark } from '@/components/ink/InkMark';
import { roleFor } from '@/lib/color';

export interface BallotProgressProps {
  steps: Position[];
  currentIndex: number;
  selections: Record<string, string>;
  /** Used to tint the house-captain step with that house's colour. */
  houseById?: Map<string, House>;
}

/**
 * How far down the ballot you are.
 *
 * One box per position *this voter* is eligible for, marked in ink as it is
 * answered — so the row fills in the way a paper ballot does. An employee sees
 * six boxes, never six of ten.
 *
 * WHY THEY ARE ALL THE SAME SHAPE
 * An earlier version cycled the four elementary forms here. It looked lively
 * and it was wrong twice over. Visually, equal bounding boxes are not equal
 * weight — a semicircle carries 39% of a square's ink, so the row read as
 * uneven no matter how it was sized. More importantly the variety carried no
 * information: the form told a voter nothing about the step. The forms belong
 * to the houses, where they mean something; here they were decoration dressed
 * as signal.
 *
 * What DOES carry information is kept: the house-captain step takes that
 * house's colour, so a voter can see their own house waiting at the end of the
 * row.
 *
 * The count beside it is the accessible version; the boxes are decorative.
 */
export function BallotProgress({
  steps,
  currentIndex,
  selections,
  houseById,
}: BallotProgressProps) {
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
          const house = step.houseId ? houseById?.get(step.houseId) : undefined;
          const accent = house ? roleFor(house.color).text : 'var(--color-mark-text)';

          return (
            <li
              key={step.id}
              className={`bh-box ${current ? 'bh-box--current' : ''}`}
              style={{
                borderColor: current || done ? accent : 'var(--color-rule-light)',
                borderWidth: current ? 3 : 2,
                background: current ? 'var(--color-sunk)' : 'transparent',
              }}
            >
              {done && (
                <span className="bh-box__mark">
                  <InkMark marked size="sm" color={accent} />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <style>{`
        .bh-box {
          position: relative;
          width: 20px; height: 20px;
          border-style: solid;
          display: inline-block;
          transition: border-color 200ms var(--ease-out);
        }
        .bh-box__mark {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          transform: translateY(-1px);
        }
        .bh-box--current { animation: box-pulse 1.9s var(--ease-out) infinite }
        @keyframes box-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.16) } }
        @media (prefers-reduced-motion: reduce) { .bh-box--current { animation: none } }
      `}</style>
    </div>
  );
}
