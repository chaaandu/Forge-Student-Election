import { useState, type KeyboardEvent } from 'react';
import type { Candidate } from '@mesa/election-core';
import { InkMark } from '@/components/ink/InkMark';
import { roleFor } from '@/lib/color';
import { candidatePhoto } from '@/lib/candidatePhoto';

export interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  /**
   * The field colour for this contest: a house colour, or the default red.
   *
   * Must be a LITERAL hex. `roleFor` can only correct a colour it can read, so
   * a `var(--bh-red)` here silently skipped the whole ink-on-field machinery
   * and fell back to the page ink — black on red at 3.92:1 on paper, and cream
   * on red at 4.02:1 at night. Both under AA, on the one element that tells a
   * voter what they just picked.
   */
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
  accent = '#DE2B1F',
  onSelect,
  tabbable,
  onKeyDown,
  index,
}: CandidateCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const photo = candidatePhoto(candidate);
  const showPhoto = Boolean(photo) && !imageFailed;

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
      {/*
        A fixed HEIGHT, not an aspect ratio. This is what lets the cards widen
        to fill the plate when only two candidates stand without the page
        growing taller: a wider card stays exactly as tall, and the photo simply
        crops wider.
      */}
      <div
        className="bh-photo relative w-full overflow-hidden"
        data-photo
        style={{ background: 'var(--color-sunk)' }}
      >
        {showPhoto ? (
          <img
            src={photo}
            alt=""
            width={400}
            height={500}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
            // Top-aligned, matching the crop the import already applied. The
            // box is a fixed height and a variable width, so a wide card can
            // still need to take something off the photo; anchoring to the top
            // means it comes off the bottom and never off a head.
            style={{ objectPosition: 'center top' }}
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
          <span
            className="label mt-2 block"
            style={{ color: 'inherit', opacity: selected ? 1 : 0.6 }}
          >
            {selected ? 'Selected' : 'Choose'}
          </span>
        </span>
      </div>

      <style>{`
        /* A fixed HEIGHT, never an aspect ratio: it is what lets a card widen
           to fill the plate without the page growing taller. */
        .bh-photo { height: clamp(180px, 24vh, 232px); }
        /* On a phone the grid drops to two narrow columns, and a 200px portrait
           above a 90px name turned one position into two screens of scrolling.
           The face is still the largest thing on the card. */
        @media (max-width: 640px) { .bh-photo { height: 132px } }
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
        /*
          A SELECTED card sits on a block of its own FIELD colour.

          The offset block is how this interface shows depth, and on the dark
          ground it is --color-block: a near-black grey that is nearly invisible
          against a near-black page, so the chosen card lifted into nothing. The
          old paper value was --color-ink, which at night is CREAM: a bright
          halo round the one card the voter just picked, which is worse.

          Taking the field colour solves both and says something true — the
          block under the card is the same red, or the same house colour, as the
          bar across its foot. The mark, the field, the word "Selected" and now
          the block are all one signal.
        */
        .bh-candidate[data-selected="true"] {
          transform: translate(-3px, -3px);
          box-shadow: 7px 7px 0 var(--field);
        }
        @media (prefers-reduced-motion: reduce) {
          .bh-candidate, .bh-candidate:hover, .bh-candidate:active,
          .bh-candidate[data-selected="true"] { transform: none }
        }
      `}</style>
    </div>
  );
}
