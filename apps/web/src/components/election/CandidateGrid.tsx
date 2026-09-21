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
      Cards grow to fill the plate, capped — and the card height is fixed by the
      photo, not by an aspect ratio.

      The first version used `minmax(214px, 1fr)`, which shared the row out
      between however many candidates stood. Four gave sensible cards; two gave
      two very wide ones, and because the photo was 4:5 a wider card was a
      TALLER card. The positions with the fewest candidates produced the tallest
      pages, and the layout resized under the voter at every step.

      The second version pinned the width instead. That fixed the height but
      left a two-candidate position looking sparse, with most of the plate
      empty.

      This does both: `auto-fit` lets two candidates widen into the space, the
      300px cap stops them becoming letterboxes, and the fixed photo height
      keeps every plate exactly as tall as every other.
    */
    <div
      ref={containerRef}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid justify-center gap-4 sm:gap-5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 300px))' }}
    >
      {candidates.map((candidate, index) => (
        <div
          key={candidate.id}
          data-candidate-slot
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
