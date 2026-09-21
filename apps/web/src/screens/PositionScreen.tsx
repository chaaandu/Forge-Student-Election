import type { Candidate, House, Position } from '@mesa/election-core';
import { Sheet } from '@/components/paper/Sheet';
import { BallotProgress } from '@/components/election/BallotProgress';
import { CandidateGrid } from '@/components/election/CandidateGrid';
import { Button } from '@/components/ui/Button';

export interface PositionScreenProps {
  step: Position;
  steps: Position[];
  gateIndex: number;
  candidates: Candidate[];
  selections: Record<string, string>;
  house?: House;
  direction: 1 | -1;
  isEditing: boolean;
  onSelect: (candidateId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * One position, one sheet.
 *
 * The frame stays quiet so the candidates carry the screen: a small printed
 * header, a row of progress boxes, and the ballot lines. Advancing never
 * happens on selection — an accidental tap must not move the ballot on.
 */
export function PositionScreen({
  step,
  steps,
  gateIndex,
  candidates,
  selections,
  house,
  direction,
  isEditing,
  onSelect,
  onNext,
  onBack,
}: PositionScreenProps) {
  const selected = selections[step.id];
  const accent = house?.color;

  return (
    <div
      className="position-step mx-auto w-full max-w-4xl"
      key={step.id}
      style={{ ['--from' as string]: `${direction * 18}px` }}
    >
      <Sheet>
        <header className="flex flex-col gap-4 px-6 pb-6 pt-7 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h1 style={{ fontSize: 'var(--text-xl)' }}>{step.title}</h1>
            <BallotProgress steps={steps} currentIndex={gateIndex} selections={selections} />
          </div>

          <p style={{ color: 'var(--color-ink-soft)', fontSize: 'var(--text-sm)' }}>
            {house
              ? `Choose one candidate to be ${house.name} house captain. You vote for your own house only.`
              : 'Choose one candidate.'}
          </p>
        </header>

        <hr className="rule" style={house ? { background: `${house.color}55` } : undefined} />

        <div className="px-6 py-7 sm:px-9">
          <h2 id="position-heading" className="sr-only">
            {step.title} — choose one candidate
          </h2>
          <CandidateGrid
            candidates={candidates}
            {...(selected ? { selectedId: selected } : {})}
            {...(accent ? { accent } : {})}
            onSelect={onSelect}
            labelledBy="position-heading"
          />
        </div>

        <hr className="rule" />

        <div className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-9">
          <Button variant="secondary" size="lg" onClick={onBack}>
            Back
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={onNext}
            disabled={!selected}
            disabledReason={`Choose a candidate for ${step.title} to continue.`}
          >
            {isEditing ? 'Save and return to review' : 'Continue'}
          </Button>

          {/* The disabled reason, visible as well as announced. */}
          {!selected && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-soft)' }}>
              Choose a candidate to continue.
            </p>
          )}
        </div>
      </Sheet>

      <style>{`
        .position-step { animation: step-in var(--dur-step) var(--ease-paper) both }
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
