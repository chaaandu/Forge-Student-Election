import type { Candidate, House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { BOARD, COPY } from '@/lib/copy';

export interface ReviewScreenProps {
  voter: VoterProfile;
  steps: Position[];
  selections: Record<string, string>;
  candidateById: Map<string, Candidate>;
  houseById: Map<string, House>;
  onEdit: (positionId: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

/**
 * The boarding pass.
 *
 * Only the positions this voter was eligible for appear. An employee's pass has
 * no House Captains section at all — not an empty one, which would read as an
 * abstention they never made.
 */
export function ReviewScreen({
  voter,
  steps,
  selections,
  candidateById,
  houseById,
  onEdit,
  onSubmit,
  onBack,
}: ReviewScreenProps) {
  const complete = steps.every((step) => selections[step.id]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BoardPanel>
        <div className="px-5 pt-7 sm:px-8">
          <SplitFlap text={BOARD.ready} size="lg" tone="go" announce />
          <h1 className="mt-4" style={{ fontSize: 'var(--text-xl)', fontWeight: 650 }}>
            Your selections
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={voter.name} size="sm" />
            <span style={{ color: 'var(--color-text-muted)' }}>{voter.name}</span>
            {/* eligibility-branch-ok: tag colour only, not an election rule */}
            <Tag tone={voter.type === 'student' ? 'signal' : 'brand'}>{voter.type}</Tag>
          </div>
        </div>

        <ul className="m-0 mt-6 list-none p-0">
          {steps.map((step, index) => {
            const candidate = candidateById.get(selections[step.id] ?? '');
            const house = step.houseId ? houseById.get(step.houseId) : undefined;

            return (
              <li
                key={step.id}
                className="review-row flex items-center gap-4 px-5 py-4 sm:px-8"
                style={{
                  borderTop: '1px solid var(--color-line)',
                  animationDelay: `${Math.min(index, 8) * 45}ms`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="font-board uppercase"
                    style={{
                      fontSize: 'var(--text-2xs)',
                      letterSpacing: '0.16em',
                      color: house ? house.color : 'var(--color-text-dim)',
                    }}
                  >
                    {step.title}
                  </p>
                  <p className="mt-1 truncate" style={{ fontSize: 'var(--text-md)', fontWeight: 550 }}>
                    {candidate ? candidate.name : '— not chosen —'}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => onEdit(step.id)}
                  aria-label={`Edit your choice for ${step.title}`}
                >
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>

        {/* The perforated tear line. Decorative — the warning below carries the meaning. */}
        <div aria-hidden="true" className="tear mt-2" />

        <div className="px-5 py-7 sm:px-8">
          <p
            className="mx-auto max-w-lg text-center"
            style={{ fontSize: 'var(--text-md)', color: 'var(--color-text)' }}
          >
            {COPY.review.warning}
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" size="lg" onClick={onBack}>
              ← Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onSubmit}
              disabled={!complete}
              disabledReason="Every position needs a selection before you can submit."
            >
              Confirm &amp; Submit Vote
            </Button>
          </div>
        </div>
      </BoardPanel>

      <style>{`
        .review-row { animation: row-in var(--dur-enter) var(--ease-glide) both }
        @keyframes row-in {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: translateY(0) }
        }
        .tear {
          height: 1px;
          background: repeating-linear-gradient(
            to right,
            var(--color-line) 0 8px,
            transparent 8px 16px
          );
          animation: tear-draw 300ms var(--ease-glide) both;
          transform-origin: left center;
        }
        @keyframes tear-draw { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes row-in { from { opacity: 0 } to { opacity: 1 } }
          .tear { animation: none }
        }
      `}</style>
    </div>
  );
}
