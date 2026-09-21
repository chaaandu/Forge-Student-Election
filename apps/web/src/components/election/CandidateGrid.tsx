import { useRef, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
import { CandidateCard } from './CandidateCard';

export interface CandidateGridProps {
  candidates: Candidate[];
  selectedId?: string;
  accent?: string;
  onSelect: (candidateId: string) => void;
  /** id of the heading that names this contest. */
  labelledBy: string;
}

/**
 * A radiogroup of candidates with a roving tabindex.
 *
 * Tab reaches the group once; arrow keys move within it and Space/Enter
 * selects — the pattern a screen-reader user expects from a radio group, and
 * the fastest one for a sighted keyboard user too.
 */
export function CandidateGrid({
  candidates,
  selectedId,
  accent,
  onSelect,
  labelledBy,
}: CandidateGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusCard = (index: number) => {
    const clamped = (index + candidates.length) % candidates.length;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-candidate-card="${clamped}"]`)
      ?.focus();
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusCard(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusCard(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusCard(0);
        break;
      case 'End':
        event.preventDefault();
        focusCard(candidates.length - 1);
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        onSelect(candidates[index]!.id);
        break;
      default:
        break;
    }
  };

  // Roving tabindex: the selected card, or the first one if nothing is chosen.
  const tabbableIndex = Math.max(
    0,
    candidates.findIndex((c) => c.id === selectedId),
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-4 sm:gap-5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}
    >
      {candidates.map((candidate, index) => (
        <div
          key={candidate.id}
          style={{
            animation: `card-in var(--dur-enter) var(--ease-glide) both`,
            // Capped so a large field never makes the last card crawl in.
            animationDelay: `${Math.min(index, 6) * 40}ms`,
          }}
        >
          <CandidateCard
            candidate={candidate}
            index={index}
            selected={candidate.id === selectedId}
            {...(accent ? { accent } : {})}
            onSelect={onSelect}
            tabbable={index === tabbableIndex}
            onKeyDown={handleKeyDown(index)}
          />
        </div>
      ))}

      <style>{`
        @keyframes card-in {
          from { opacity: 0; transform: translateY(10px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes card-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
