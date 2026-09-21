import { useState, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
import { InkMark } from '@/components/ink/InkMark';
import { Avatar } from '@/components/ui/Avatar';

export interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  accent?: string;
  onSelect: (candidateId: string) => void;
  /** Roving tabindex: only one card in a group is tabbable. */
  tabbable: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  index: number;
}

/**
 * One line of the ballot.
 *
 * Composed like a printed ballot paper rather than a web card: a portrait, then
 * a ruled row with a box on the left and the candidate's name beside it. You
 * mark the box. Choosing is an act, not a state change.
 *
 * Selection carries three simultaneous signals — the drawn ink mark, the
 * darkened edge and warm wash, and the literal word "Selected" — so it is
 * never communicated by colour alone. `role="radio"` inside the grid's
 * `radiogroup` makes a screen reader announce "2 of 3, selected".
 */
export function CandidateCard({
  candidate,
  selected,
  accent = 'var(--color-mark)',
  onSelect,
  tabbable,
  onKeyDown,
  index,
}: CandidateCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(candidate.photoUrl) && !imageFailed;

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      data-candidate-card={index}
      onClick={() => onSelect(candidate.id)}
      onKeyDown={onKeyDown}
      className="candidate group flex cursor-pointer flex-col overflow-hidden text-left"
      style={{
        background: selected ? 'var(--color-mark-wash)' : 'var(--color-sheet)',
        border: `1px solid ${selected ? accent : 'var(--color-edge)'}`,
        boxShadow: selected ? 'var(--shadow-lift)' : 'var(--shadow-sheet)',
        borderRadius: 'var(--radius-sheet)',
        transition:
          'border-color 180ms var(--ease-paper), background-color 180ms var(--ease-paper), ' +
          'transform 180ms var(--ease-paper), box-shadow 180ms var(--ease-paper)',
      }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '4 / 5', background: 'var(--color-sheet-sunk)' }}
      >
        {showPhoto ? (
          <img
            src={candidate.photoUrl}
            alt=""
            width={400}
            height={500}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
            style={{ objectPosition: 'center 25%' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Avatar name={candidate.name} color={accent} size="lg" />
          </div>
        )}
      </div>

      {/* The ballot line: box, then name. */}
      <div
        className="flex items-start gap-3 p-4"
        style={{ borderTop: `1px solid ${selected ? `${accent}55` : 'var(--color-rule)'}` }}
      >
        <span
          aria-hidden="true"
          className="relative mt-0.5 flex shrink-0 items-center justify-center"
          style={{
            width: 26,
            height: 26,
            borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${selected ? accent : 'var(--color-rule-strong)'}`,
            background: selected ? 'transparent' : 'var(--color-sheet)',
          }}
        >
          <span className="absolute" style={{ transform: 'translate(1px, -1px)' }}>
            <InkMark marked={selected} size="sm" color={accent} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className="block"
            style={{ fontSize: 'var(--text-md)', fontWeight: 550, lineHeight: 1.3 }}
          >
            {candidate.name}
          </span>

          {candidate.tagline && (
            <span
              className="mt-1 block"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-ink-soft)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {candidate.tagline}
            </span>
          )}

          {/* The third signal: the state in words. */}
          <span
            className="label mt-2 block"
            style={{ color: selected ? accent : 'var(--color-ink-faint)' }}
          >
            {selected ? 'Selected' : 'Choose'}
          </span>
        </span>
      </div>

      <style>{`
        .candidate:hover { transform: translateY(-2px); border-color: var(--color-rule-strong); }
        .candidate:active { transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) { .candidate:hover { transform: none } }
      `}</style>
    </div>
  );
}
