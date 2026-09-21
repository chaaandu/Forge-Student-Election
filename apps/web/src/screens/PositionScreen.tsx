import type { Candidate, House, Position } from '@mesa/election-core';
import { BallotProgress } from '@/components/election/BallotProgress';
import { CandidateGrid } from '@/components/election/CandidateGrid';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { Button } from '@/components/ui/Button';
import { roleFor } from '@/lib/color';

export interface PositionScreenProps {
  step: Position;
  steps: Position[];
  gateIndex: number;
  candidates: Candidate[];
  selections: Record<string, string>;
  house?: House;
  /** All houses, so the progress row can tint the house step. */
  houseById?: Map<string, House>;
  direction: 1 | -1;
  isEditing: boolean;
  onSelect: (candidateId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * One position, one plate.
 *
 * A Bauhaus exhibition plate: a numbered colour field carrying the position, a
 * heavy rule, and the candidates below. House contests take that house's field
 * colour and form across the whole header, so a student arrives at their own
 * house's plate and it is unmistakably theirs.
 *
 * Advancing never happens on selection — an accidental tap must not move the
 * ballot on.
 */
export function PositionScreen({
  step,
  steps,
  gateIndex,
  candidates,
  selections,
  house,
  houseById,
  direction,
  isEditing,
  onSelect,
  onNext,
  onBack,
}: PositionScreenProps) {
  const selected = selections[step.id];
  // A house contest takes that house's colour across the header. `roleFor`
  // returns a field guaranteed to carry its ink — a raw mid-tone brand colour
  // can carry neither black nor white.
  const role = house ? roleFor(house.color) : null;
  const field = role?.field ?? 'var(--color-ink)';
  const onField = role?.onField ?? 'var(--color-paper)';

  return (
    <div
      className="bh-step mx-auto w-full max-w-5xl"
      key={step.id}
      style={{ ['--from' as string]: `${direction * 26}px` }}
    >
      <div className="panel panel--raised overflow-hidden">
        {/* The numbered field. */}
        <header
          className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-6 sm:px-8"
          style={{ background: field, color: onField }}
        >
          <span
            className="numeral"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 4rem)', opacity: 0.95 }}
            aria-hidden="true"
          >
            {String(gateIndex + 1).padStart(2, '0')}
          </span>

          {house && <HouseCrest house={house} size={52} />}

          <h1 className="poster min-w-0 flex-1" style={{ fontSize: 'clamp(1.6rem, 4.6vw, 2.75rem)' }}>
            {step.title}
          </h1>
        </header>

        <div
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8"
          style={{ borderBottom: 'var(--rule-weight) solid var(--color-ink)' }}
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
            {house
              ? `Choose one candidate for ${house.name} house captain. You vote for your own house only.`
              : 'Choose one candidate.'}
          </p>
          <BallotProgress
            steps={steps}
            currentIndex={gateIndex}
            selections={selections}
            {...(houseById ? { houseById } : {})}
          />
        </div>

        <div className="px-6 py-8 sm:px-8">
          <h2 id="position-heading" className="sr-only">
            {step.title} — choose one candidate
          </h2>
          <CandidateGrid
            candidates={candidates}
            {...(selected ? { selectedId: selected } : {})}
            {...(house?.color ? { accent: house.color } : {})}
            onSelect={onSelect}
            labelledBy="position-heading"
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-8"
          style={{ borderTop: 'var(--rule-weight) solid var(--color-ink)' }}
        >
          <Button variant="secondary" size="lg" onClick={onBack}>
            <span aria-hidden="true">←</span> Back
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={onNext}
            disabled={!selected}
            disabledReason={`Choose a candidate for ${step.title} to continue.`}
          >
            {isEditing ? "Save and review" : "Continue"}
            <span aria-hidden="true">→</span>
          </Button>

          {/* The disabled reason, visible as well as announced. */}
          {!selected && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
              Choose a candidate to continue.
            </p>
          )}
        </div>
      </div>

      <style>{`
        .bh-step { animation: step-in var(--dur-step) var(--ease-out) both }
        @keyframes step-in {
          from { opacity: 0; transform: translateX(var(--from)) }
          to   { opacity: 1; transform: translateX(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes step-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
