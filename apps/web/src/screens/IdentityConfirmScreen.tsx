import type { House } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { roleFor } from '@/lib/color';
import { TYPE_FIELD } from '@/lib/voterType';

export interface IdentityConfirmScreenProps {
  voter: VoterProfile;
  house?: House;
  onConfirm: () => void;
  onStartOver: () => void;
}

/**
 * The name on the ballot.
 *
 * A full screen rather than a toast, because this is the last moment at which
 * an identity mistake is cheap to fix — and because check-in is supervised, the
 * name is set poster-large so an invigilator can read it across a booth.
 */
export function IdentityConfirmScreen({
  voter,
  house,
  onConfirm,
  onStartOver,
}: IdentityConfirmScreenProps) {
  const role = house ? roleFor(house.color) : null;
  const field = role?.field ?? 'var(--bh-blue)';
  const onField = role?.onField ?? '#FFFFFF';

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="bh-pass panel panel--raised overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-5 px-6 py-7 sm:px-8"
          style={{ background: field, color: onField }}
        >
          {/*
            No house colour here, deliberately: the header behind it IS the
            house field, so a house-coloured block on it has nothing to stand
            against and reads as an empty outline. Neutral, it is a plate on the
            field — the same treatment the crest opposite now gets. The house is
            already carried three times over on this screen: the field, the
            crest, and the tag below.
          */}
          <Avatar name={voter.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="label" style={{ color: onField, opacity: 0.75 }}>
              Voting as
            </p>
            {/* Poster-large on purpose: the invigilator checks this, not the software. */}
            <h1
              className="poster mt-1 truncate"
              style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)' }}
            >
              {voter.name}
            </h1>
            <p className="mt-1 truncate" style={{ fontSize: 'var(--text-sm)', opacity: 0.85 }}>
              {voter.email}
            </p>
          </div>
          {house && <HouseCrest house={house} size={64} onField />}
        </div>

        <div className="px-6 py-7 sm:px-8">
          {/*
            Two tags, not three. The third was `7 POSITIONS` on a yellow field,
            which put a third tag treatment in a row of three and gave a plain
            fact the visual weight of an identity. Colour here means house; the
            type tag has its own hue, which belongs to no house.
          */}
          <div className="flex flex-wrap gap-2">
            <Tag color={TYPE_FIELD[voter.type]}>{voter.type}</Tag>
            {house && <Tag color={house.color}>{house.name}</Tag>}
          </div>

          {/*
            No "N choices" sentence.

            It explained the ballot before the voter had seen it, and the half
            aimed at employees — "House captains are voted on by students" —
            answered a question nobody had asked yet about a screen they were
            never going to see. The progress row on the first position says how
            many steps there are, at the moment that becomes useful.
          */}

          <div className="bar mt-6" style={{ maxWidth: 160 }} />

          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={onConfirm} autoFocus>
              That&apos;s me <span aria-hidden="true">→</span>
            </Button>
            <Button variant="quiet" size="lg" onClick={onStartOver}>
              Not you? Start again
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .bh-pass { animation: pass-in var(--dur-enter) var(--ease-snap) both }
        @keyframes pass-in {
          from { opacity: 0; transform: translateY(14px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pass-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
