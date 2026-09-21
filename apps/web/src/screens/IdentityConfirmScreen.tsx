import type { House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { Sheet } from '@/components/paper/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

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
 * The name at the top of the ballot.
 *
 * A full screen rather than a toast, because this is the last moment at which
 * an identity mistake is cheap to fix — and because check-in is supervised, the
 * name is set large enough for an invigilator to read across a booth.
 */
export function IdentityConfirmScreen({
  voter,
  house,
  gateCount,
  steps,
  onConfirm,
  onStartOver,
}: IdentityConfirmScreenProps) {
  const accent = house?.color ?? 'var(--color-mark)';
  const endsWithHouseGate = steps.at(-1)?.kind === 'house-captain';

  return (
    <div className="mx-auto w-full max-w-xl">
      <Sheet raised className="ballot-head overflow-hidden">
        <div className="px-6 pt-7 sm:px-9">
          <p className="label">Voting as</p>

          <div className="mt-4 flex items-center gap-5">
            <Avatar name={voter.name} color={accent} size="lg" />
            <div className="min-w-0">
              {/* Large on purpose: the invigilator checks this, not the software. */}
              <h1
                className="truncate"
                style={{ fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', lineHeight: 1.1 }}
              >
                {voter.name}
              </h1>
              <p className="mt-1 truncate" style={{ color: 'var(--color-ink-soft)' }}>
                {voter.email}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Tag>{voter.type}</Tag>
            {house && <Tag color={house.color}>{house.name}</Tag>}
            <Tag>
              {gateCount} {gateCount === 1 ? 'position' : 'positions'}
            </Tag>
          </div>
        </div>

        <hr className="rule mt-7" />

        <div className="px-6 py-7 sm:px-9">
          <p style={{ color: 'var(--color-ink-soft)' }}>
            {/*
              Derived from this voter's actual sequence rather than their type.
              If a future configuration gives employees a house contest — or
              students a second one — this stays true with no edit.
            */}
            {endsWithHouseGate
              ? `You will vote in ${gateCount} positions, ending with your house captain.`
              : `You will vote in ${gateCount} leadership positions. House captains are voted on by students.`}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={onConfirm} autoFocus>
              That&apos;s me — start voting
            </Button>
            <Button variant="quiet" size="lg" onClick={onStartOver}>
              Not you? Start over
            </Button>
          </div>
        </div>
      </Sheet>

      <style>{`
        .ballot-head { animation: head-in var(--dur-enter) var(--ease-paper) both }
        @keyframes head-in {
          from { opacity: 0; transform: translateY(12px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes head-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
