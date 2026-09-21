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
 * Tab reaches the group once; arrow keys move within it and Space or Enter
 * marks — the pattern a screen-reader user expects from a radio group, and the
 * fastest one for a sighted keyboard user too.
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
    containerRef.current?.querySelector<HTMLElement>(`[data-candidate-card="${clamped}"]`)?.focus();
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

  const tabbableIndex = Math.max(
    0,
    candidates.findIndex((c) => c.id === selectedId),
  );

  return (
    /*
      Fixed-width cards, centred — NOT a stretching grid.

      This used `repeat(auto-fit, minmax(214px, 1fr))`, which shares the row out
      between however many candidates there are. With four that gave sensible
      cards; with two it gave two very wide ones, and since the portrait is 4:5
      a wider card is a TALLER card. So the positions with the fewest candidates
      produced the tallest pages — exactly backwards — and every step resized as
      the voter moved through the ballot.

      A fixed width makes one card identical on every position, so every
      position plate is the same height and the page stops jumping. Two
      candidates simply sit centred with air either side, which reads as
      deliberate rather than stretched.
    */
    <div
      ref={containerRef}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-wrap justify-center gap-4 sm:gap-5"
    >
      {candidates.map((candidate, index) => (
        <div
          key={candidate.id}
          data-candidate-slot
          className="bh-slot"
          style={{
            animation: 'card-in var(--dur-enter) var(--ease-paper) both',
            // Capped so a large field never makes the last card crawl in.
            animationDelay: `${Math.min(index, 6) * 45}ms`,
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
        /* One width for every card on every position, so each plate is the
           same height. Upper bound keeps four across inside the plate; lower
           bound keeps a card usable on a narrow screen. */
        .bh-slot { width: clamp(158px, 19vw, 200px); }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(8px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes card-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
