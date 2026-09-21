import { useState, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
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
 * A candidate.
 *
 * Selection is carried by three simultaneous signals — the amber border, the
 * stamp glyph, and the literal word "Selected" — so it is never communicated
 * by colour alone. The whole card is the target, and `role="radio"` inside the
 * grid's `radiogroup` means a screen reader announces "2 of 3, selected".
 */
export function CandidateCard({
  candidate,
  selected,
  accent = 'var(--color-signal)',
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
      className="candidate-card group relative flex cursor-pointer flex-col text-left"
      style={{
        background: 'var(--color-surface)',
        border: `2px solid ${selected ? accent : 'var(--color-line)'}`,
        borderRadius: 'var(--radius-card)',
        boxShadow: selected ? 'var(--shadow-card)' : 'none',
        overflow: 'hidden',
        transition: 'border-color 160ms var(--ease-glide), transform 160ms var(--ease-glide), background-color 160ms',
      }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '4 / 5', background: 'var(--color-flap)' }}
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

        {selected && (
          <span
            aria-hidden="true"
            className="stamp absolute right-3 top-3 flex items-center justify-center font-board"
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-flap)',
              background: accent,
              color: 'var(--color-signal-ink)',
              fontWeight: 700,
            }}
          >
            ✓
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p style={{ fontSize: 'var(--text-md)', fontWeight: 550, lineHeight: 1.25 }}>
          {candidate.name}
        </p>

        {candidate.tagline && (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {candidate.tagline}
          </p>
        )}

        {/* The third signal: the state in words, not just colour and a glyph. */}
        <p
          className="mt-auto pt-2 font-board uppercase"
          style={{
            fontSize: 'var(--text-2xs)',
            letterSpacing: '0.14em',
            color: selected ? accent : 'var(--color-text-dim)',
          }}
        >
          {selected ? '✓ Selected' : 'Select'}
        </p>
      </div>

      <style>{`
        .candidate-card:hover { background: var(--color-surface-hi); transform: translateY(-2px); }
        .candidate-card:active { transform: translateY(0); }
        .stamp { animation: stamp-land var(--dur-select) var(--ease-mech) both; }
        @keyframes stamp-land {
          from { transform: scale(1.4) rotate(6deg); opacity: 0 }
          to { transform: scale(1) rotate(0deg); opacity: 1 }
        }
        @media (prefers-reduced-motion: reduce) {
          .candidate-card:hover { transform: none }
          .stamp { animation: none }
        }
      `}</style>
    </div>
  );
}
