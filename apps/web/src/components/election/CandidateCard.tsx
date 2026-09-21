import { useState, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
import { InkMark } from '@/components/ink/InkMark';
import { roleFor } from '@/lib/color';

export interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  /** The field colour for this contest: a house colour, or the default red. */
  accent?: string;
  onSelect: (candidateId: string) => void;
  tabbable: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  index: number;
}

/**
 * A candidate, as a printed plate.
 *
 * Unselected it is a white panel with a heavy keyline. Choosing snaps a solid
 * colour field across the foot of the card and drops an ink mark into the box —
 * the card physically moves into its own shadow, the way the buttons do.
 *
 * Selection carries FOUR simultaneous signals: the drawn mark, the colour field,
 * the offset block, and the literal word "Selected". Never colour alone.
 * `role="radio"` in the grid's `radiogroup` announces "2 of 3, selected".
 */
export function CandidateCard({
  candidate,
  selected,
  accent = 'var(--bh-red)',
  onSelect,
  tabbable,
  onKeyDown,
  index,
}: CandidateCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(candidate.photoUrl) && !imageFailed;

  // Resolve a literal colour so the ink on the field can be chosen correctly.
  const literal = accent.startsWith('#') ? accent : undefined;
  const role = literal ? roleFor(literal) : undefined;
  const field = role?.field ?? accent;
  const onFieldInk = role?.onField ?? 'var(--color-ink)';

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      data-candidate-card={index}
      data-selected={selected}
      onClick={() => onSelect(candidate.id)}
      onKeyDown={onKeyDown}
      className="bh-candidate group flex cursor-pointer flex-col overflow-hidden"
      style={{ ['--field' as string]: field, ['--on-field' as string]: onFieldInk }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '4 / 5', background: 'var(--color-sunk)' }}
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
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'var(--color-sunk)' }}
          >
            <span
              className="numeral"
              style={{ fontSize: '3.2rem', color: 'var(--color-ink-faint)' }}
            >
              {candidate.name
                .replace(/['’]/g, '')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* The ballot line: box, then name. */}
      <div className="bh-candidate__body flex flex-1 items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className="relative mt-0.5 flex shrink-0 items-center justify-center"
          style={{
            width: 26,
            height: 26,
            border: `3px solid ${selected ? 'var(--on-field)' : 'var(--color-ink)'}`,
            background: selected ? 'transparent' : 'var(--color-card)',
          }}
        >
          <span className="absolute" style={{ transform: 'translate(1px, -1px)' }}>
            <InkMark marked={selected} size="sm" color="var(--on-field)" />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className="block"
            style={{ fontSize: 'var(--text-md)', fontWeight: 600, lineHeight: 1.25 }}
          >
            {candidate.name}
          </span>

          {candidate.tagline && (
            <span
              className="mt-1 block"
              style={{
                fontSize: 'var(--text-xs)',
                opacity: 0.85,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {candidate.tagline}
            </span>
          )}

          {/* The fourth signal: the state in words. */}
          <span className="label mt-2 block" style={{ color: 'inherit', opacity: selected ? 1 : 0.6 }}>
            {selected ? 'Selected' : 'Choose'}
          </span>
        </span>
      </div>

      <style>{`
        .bh-candidate {
          background: var(--color-card);
          border: 3px solid var(--color-ink);
          box-shadow: var(--shadow-block-sm);
          transition: transform var(--dur-snap) var(--ease-snap),
                      box-shadow var(--dur-snap) var(--ease-snap);
        }
        .bh-candidate:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--color-ink); }
        .bh-candidate:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--color-ink); }
        /* Chosen: the field snaps across the foot of the card and it settles in. */
        .bh-candidate[data-selected="true"] .bh-candidate__body {
          background: var(--field);
          color: var(--on-field);
        }
        .bh-candidate[data-selected="true"] {
          transform: translate(-3px, -3px);
          box-shadow: 7px 7px 0 var(--color-ink);
        }
        @media (prefers-reduced-motion: reduce) {
          .bh-candidate, .bh-candidate:hover, .bh-candidate:active,
          .bh-candidate[data-selected="true"] { transform: none }
        }
      `}</style>
    </div>
  );
}
