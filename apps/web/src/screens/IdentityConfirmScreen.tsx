import type { House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { roleFor } from '@/lib/color';

export interface IdentityConfirmScreenProps {
  voter: VoterProfile;
  house?: House;
  gateCount: number;
  /** This voter's own sequence — the source of everything shown here. */
  steps: Position[];
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
  gateCount,
  steps,
  onConfirm,
  onStartOver,
}: IdentityConfirmScreenProps) {
  const role = house ? roleFor(house.color) : null;
  const field = role?.field ?? 'var(--bh-blue)';
  const onField = role?.onField ?? '#FFFFFF';
  const endsWithHouseGate = steps.at(-1)?.kind === 'house-captain';

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="bh-pass panel panel--raised overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-5 px-6 py-7 sm:px-8"
          style={{ background: field, color: onField }}
        >
          <Avatar name={voter.name} size="lg" {...(house?.color ? { color: house.color } : {})} />
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
          {house && <HouseCrest house={house} size={64} />}
        </div>

        <div className="px-6 py-7 sm:px-8">
          <div className="flex flex-wrap gap-2">
            <Tag>{voter.type}</Tag>
            {house && <Tag color={house.color}>{house.name}</Tag>}
            <Tag color="#FFC20E">
              {gateCount} {gateCount === 1 ? 'position' : 'positions'}
            </Tag>
          </div>

          <div className="bar mt-6" style={{ maxWidth: 160 }} />

          <p className="mt-6" style={{ fontSize: 'var(--text-md)' }}>
            {/*
              Derived from this voter's actual sequence rather than their type.
              If a future configuration gives employees a house contest — or
              students a second one — this stays true with no edit.
            */}
            {endsWithHouseGate
              ? `You will vote in ${gateCount} positions, ending with your house captain.`
              : `You will vote in ${gateCount} leadership positions. House captains are voted on by students.`}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={onConfirm} autoFocus>
              That&apos;s me — start voting <span aria-hidden="true">→</span>
            </Button>
            <Button variant="quiet" size="lg" onClick={onStartOver}>
              Not you? Start over
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
