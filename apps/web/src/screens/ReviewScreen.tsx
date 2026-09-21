import type { Candidate, House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { roleFor } from '@/lib/color';
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
      <div className="panel panel--raised overflow-hidden">
        <header
          className="px-6 py-6 sm:px-8"
          style={{
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
            borderBottom: 'var(--rule-weight) solid var(--color-ink)',
          }}
        >
          <p className="label" style={{ color: 'var(--color-paper)', opacity: 0.7 }}>
            Almost done
          </p>
          <h1 className="poster mt-2" style={{ fontSize: 'var(--text-xl)' }}>
            Check your choices
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Avatar name={voter.name} size="sm" color="#FFC20E" />
            <span style={{ fontWeight: 600 }}>{voter.name}</span>
            <Tag color="#FFC20E">{voter.type}</Tag>
          </div>
        </header>

        <ul className="list-none p-0">
          {steps.map((step, index) => {
            const candidate = candidateById.get(selections[step.id] ?? '');
            const house = step.houseId ? houseById.get(step.houseId) : undefined;
            const role = house ? roleFor(house.color) : undefined;

            return (
              <li
                key={step.id}
                className="bh-row flex items-center gap-4 px-6 py-3.5 sm:px-8"
                style={{
                  borderBottom: '2px solid var(--color-ink)',
                  animationDelay: `${Math.min(index, 8) * 45}ms`,
                }}
              >
                {/*
                  The candidate's own photo, not a tick box.

                  This row used to lead with an outlined square holding an ink
                  mark. Next to a choice already made, an outlined square reads
                  as a checkbox waiting to be ticked — the one thing this row
                  must not suggest, since nothing here is editable in place.
                  A face says "this is who you picked" without any convention to
                  decode.
                */}
                <span className="bh-thumb" aria-hidden="true">
                  {candidate?.photoUrl ? (
                    <img src={candidate.photoUrl} alt="" width={52} height={52} loading="lazy" />
                  ) : (
                    <span className="bh-thumb__initials">
                      {(candidate?.name ?? '?')
                        .replace(/['’]/g, '')
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {house && <HouseCrest house={house} size={16} />}
                    <span className="label" style={role ? { color: role.text } : undefined}>
                      {step.title}
                    </span>
                  </span>
                  <p
                    className="mt-0.5 truncate"
                    style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}
                  >
                    {candidate ? candidate.name : 'Not chosen yet'}
                  </p>
                </div>

                <Button
                  variant="quiet"
                  onClick={() => onEdit(step.id)}
                  aria-label={`Change your pick for ${step.title}`}
                >
                  Change
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="px-6 py-8 sm:px-8">
          <p
            className="mx-auto max-w-lg text-center text-balance"
            style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}
          >
            {COPY.review.warning}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" size="lg" onClick={onBack}>
              <span aria-hidden="true">←</span> Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={onSubmit}
              disabled={!complete}
              disabledReason="Every position needs a pick before you can submit."
            >
              Confirm &amp; Submit Vote
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .bh-row { animation: row-in var(--dur-enter) var(--ease-out) both }
        .bh-thumb {
          flex: none; width: 52px; height: 52px; overflow: hidden;
          border: 2px solid var(--color-ink); background: var(--color-sunk);
          display: flex; align-items: center; justify-content: center;
        }
        .bh-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: center 22% }
        .bh-thumb__initials {
          font-family: var(--font-geometric); font-weight: 600;
          font-size: var(--text-sm); color: var(--color-ink-soft);
        }
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
