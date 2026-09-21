import { useMemo } from 'react';
import type { Candidate, House, Position } from '@mesa/election-core';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { CandidateGrid } from '@/components/election/CandidateGrid';
import { RouteLine } from '@/components/election/RouteLine';
import { Button } from '@/components/ui/Button';

export interface GateScreenProps {
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

/** One position, one screen. The concept lives in the frame; the candidates stay clean. */
export function GateScreen({
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
}: GateScreenProps) {
  const selected = selections[step.id];
  const accent = house?.color;
  const gateLabel = useMemo(
    () => `GATE ${String(gateIndex + 1).padStart(2, '0')} · ${(step.shortTitle ?? step.title).toUpperCase()}`,
    [gateIndex, step],
  );

  return (
    <div
      className="mx-auto w-full max-w-4xl"
      key={step.id}
      style={{
        animation: `gate-in var(--dur-step) var(--ease-glide) both`,
        // The transition direction matches the voter's intent: forward slides
        // in from the right, Back from the left.
        ['--gate-from' as string]: `${direction * 24}px`,
      }}
    >
      <BoardPanel>
        <div
          className="flex flex-col gap-5 px-5 py-6 sm:px-8"
          style={{ borderBottom: '1px solid var(--color-line)' }}
        >
          <h1 className="m-0">
            <SplitFlap
              text={gateLabel}
              size="md"
              tone="signal"
              announce
              label={`Gate ${gateIndex + 1} of ${steps.length}: ${step.title}`}
            />
          </h1>

          <RouteLine steps={steps} currentIndex={gateIndex} selections={selections} />

          {house && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {house.name} concourse{house.motto ? ` — ${house.motto}` : ''}. You vote for your
              own house captain only.
            </p>
          )}
        </div>

        <div className="px-5 py-7 sm:px-8">
          <h2 id="gate-heading" className="sr-only">
            {step.title} — choose one candidate
          </h2>
          <CandidateGrid
            candidates={candidates}
            {...(selected ? { selectedId: selected } : {})}
            {...(accent ? { accent } : {})}
            onSelect={onSelect}
            labelledBy="gate-heading"
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-3 px-5 py-6 sm:px-8"
          style={{ borderTop: '1px solid var(--color-line)' }}
        >
          <Button variant="secondary" size="lg" onClick={onBack}>
            ← Back
          </Button>

          <Button
            variant="primary"
            size="lg"
            onClick={onNext}
            disabled={!selected}
            disabledReason={`Choose a candidate for ${step.title} to continue.`}
          >
            {isEditing ? 'Save and return to review' : 'Continue →'}
          </Button>

          {/* The disabled reason, visible as well as announced. */}
          {!selected && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              Select a candidate to continue.
            </p>
          )}
        </div>
      </BoardPanel>

      <style>{`
        @keyframes gate-in {
          from { opacity: 0; transform: translateX(var(--gate-from)) }
          to { opacity: 1; transform: translateX(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes gate-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
