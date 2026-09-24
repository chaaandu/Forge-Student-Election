import { useRef, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
import { CandidateCard } from './CandidateCard';

/**
 * How many columns a field of this size gets on a full-width plate.
 *
 * This replaces `repeat(auto-fit, minmax(158px, 300px))`, which decided the
 * count from the space available rather than from the field. In a 1024px plate
 * that fitted THREE cards across and orphaned the fourth onto a row of its own
 * — a block of empty plate beside one lonely candidate, and a President page
 * (4 standing) ~1000px tall against ~690px for a House Captain page (2
 * standing). The plate was still resizing under the voter at every step, which
 * is the exact problem §6b of the design doc claims to have solved.
 *
 * Up to four across is ONE row, so every position in this election — they run
 * 2, 3 and 4 candidates — is the same height. That is the promise actually
 * kept. Beyond four it balances the rows rather than leaving a remainder.
 */
export function columnsFor(count: number): number {
  if (count <= 4) return Math.max(count, 1);
  if (count <= 8) return Math.ceil(count / 2);
  return 4;
}

/**
 * The same question at tablet width, where four across would put every card
 * below the size a face is worth showing at.
 *
 * Up to three still fits a row at ~160px a card. Four pairs off into 2x2 rather
 * than orphaning one — which is the whole point of doing this by count, so it
 * would be odd to reintroduce the orphan one breakpoint down. This election
 * runs 2, 3 and 4, and all three land cleanly.
 *
 * Phones get one card, set by the stylesheet: two 144px cards side by side wrap
 * most of these names onto three lines, and a name a voter has to decipher is a
 * worse trade than a scroll they can already see the end of — the action bar is
 * pinned, so the length of the page costs them nothing.
 *
 * "Phone" means up to 640px, the same line CandidateCard draws. It used to be
 * 480px, which let a large phone — or any phone with its display zoom turned
 * down — through to two across, and voters saw the faces side by side.
 */
export function columnsForNarrow(count: number): number {
  return count <= 3 ? Math.max(count, 1) : 2;
}

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
      The column count comes from the field, not from the space — see
      `columnsFor` and `columnsForNarrow`. The card height is fixed by the photo
      rather than by an aspect ratio, so a card that widens does not also grow
      taller.

      The 940px breakpoint is where four across stops being worth it: below it a
      card falls under ~190px, and a 190px card carrying a 232px portrait is a
      letterbox stood on its end. An iPad in portrait is 768px and was getting
      four 148px cards before that number was measured rather than guessed.
    */
    <div
      ref={containerRef}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="bh-grid justify-center gap-4 sm:gap-5"
      style={{
        ['--cols' as string]: columnsFor(candidates.length),
        ['--cols-narrow' as string]: columnsForNarrow(candidates.length),
      }}
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
        /*
          Three tiers, all driven by the COUNT rather than by auto-fit.

          auto-fit cannot do this job here. With a definite maximum —
          minmax(140px, 300px) — the repetition count is worked out from the
          300px, so a 600px tablet fitted exactly ONE card and left the rest of
          the plate empty. Making the maximum flexible fixes the count but hands
          the choice back to the space, which is what orphaned the fourth card
          on the desktop plate in the first place.
        */
        .bh-grid { display: grid; grid-template-columns: minmax(0, 300px) }
        @media (min-width: 641px) {
          .bh-grid { grid-template-columns: repeat(var(--cols-narrow), minmax(0, 300px)) }
        }
        @media (min-width: 940px) {
          .bh-grid { grid-template-columns: repeat(var(--cols), minmax(0, 300px)) }
        }
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
