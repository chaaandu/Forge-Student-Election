import type { Candidate, House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { Sheet } from '@/components/paper/Sheet';
import { InkMark } from '@/components/ink/InkMark';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { COPY } from '@/lib/copy';

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
 * The completed ballot.
 *
 * Only the positions this voter was eligible for appear. An employee's ballot
 * has no House Captain section at all — not an empty one, which would read as
 * an abstention they never made.
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
      <Sheet raised className="overflow-hidden">
        <header className="px-6 pt-7 sm:px-9">
          <p className="label">Your completed ballot</p>
          <h1 className="mt-2" style={{ fontSize: 'var(--text-xl)' }}>
            Check your choices
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Avatar name={voter.name} size="sm" />
            <span style={{ color: 'var(--color-ink-soft)' }}>{voter.name}</span>
            <Tag>{voter.type}</Tag>
          </div>
        </header>

        <ul className="m-0 mt-6 list-none p-0">
          {steps.map((step, index) => {
            const candidate = candidateById.get(selections[step.id] ?? '');
            const house = step.houseId ? houseById.get(step.houseId) : undefined;

            return (
              <li
                key={step.id}
                className="review-row flex items-center gap-4 px-6 py-4 sm:px-9"
                style={{
                  borderTop: '1px solid var(--color-rule)',
                  animationDelay: `${Math.min(index, 8) * 45}ms`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="relative flex shrink-0 items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 2,
                    border: `1.5px solid ${candidate ? (house?.color ?? 'var(--color-mark)') : 'var(--color-rule-strong)'}`,
                  }}
                >
                  {candidate && (
                    <span className="absolute" style={{ transform: 'translateY(-1px)' }}>
                      <InkMark marked size="sm" {...(house ? { color: house.color } : {})} />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="label" style={house ? { color: house.color } : undefined}>
                    {step.title}
                  </p>
                  <p
                    className="mt-0.5 truncate"
                    style={{ fontSize: 'var(--text-md)', fontWeight: 550 }}
                  >
                    {candidate ? candidate.name : '— not chosen —'}
                  </p>
                </div>

                <Button
                  variant="quiet"
                  onClick={() => onEdit(step.id)}
                  aria-label={`Edit your choice for ${step.title}`}
                >
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="perforation mt-3" aria-hidden="true" />

        <div className="px-6 py-8 sm:px-9">
          <p
            className="mx-auto max-w-lg text-center text-balance"
            style={{ fontSize: 'var(--text-md)' }}
          >
            {COPY.review.warning}
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" size="lg" onClick={onBack}>
              Back
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
      </Sheet>

      <style>{`
        .review-row { animation: row-in var(--dur-enter) var(--ease-paper) both }
        @keyframes row-in {
          from { opacity: 0; transform: translateY(6px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes row-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
