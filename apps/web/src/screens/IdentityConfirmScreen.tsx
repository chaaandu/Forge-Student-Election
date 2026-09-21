import type { House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { BOARD } from '@/lib/copy';

export interface IdentityConfirmScreenProps {
  voter: VoterProfile;
  house?: House;
  gateCount: number;
  /** This voter's own gate sequence — the source of everything shown here. */
  steps: Position[];
  onConfirm: () => void;
  onStartOver: () => void;
}

/**
 * The boarding pass.
 *
 * A full screen rather than a toast, because this is the last moment at which
 * an identity mistake is cheap to fix. It also tells the voter exactly how many
 * gates *they* have — an employee is told six, and is never left wondering
 * where the house captains went.
 */
export function IdentityConfirmScreen({
  voter,
  house,
  gateCount,
  steps,
  onConfirm,
  onStartOver,
}: IdentityConfirmScreenProps) {
  const accent = house?.color ?? 'var(--color-signal)';
  const endsWithHouseGate = steps.at(-1)?.kind === 'house-captain';

  return (
    <div className="mx-auto w-full max-w-xl">
      <BoardPanel>
        <div className="px-5 pt-7 sm:px-8">
          <SplitFlap text={BOARD.confirmed} size="lg" tone="go" announce />
        </div>

        <div className="boarding-pass px-5 py-7 sm:px-8">
          <div className="flex items-center gap-5">
            <Avatar name={voter.name} color={accent} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate" style={{ fontSize: 'var(--text-xl)', fontWeight: 650 }}>
                {voter.name}
              </h1>
              <p className="truncate" style={{ color: 'var(--color-text-muted)' }}>
                {voter.email}
              </p>
            </div>
          </div>

          <dl className="mt-7 grid gap-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Field label="Class">
              {/* eligibility-branch-ok: tag colour only, not an election rule */}
              <Tag tone={voter.type === 'student' ? 'signal' : 'brand'}>{voter.type}</Tag>
            </Field>
            {house && (
              <Field label="House">
                <Tag color={house.color}>{house.name}</Tag>
              </Field>
            )}
            <Field label="Gates">
              <span style={{ fontFamily: 'var(--font-board)', fontSize: 'var(--text-md)' }}>
                {gateCount}
              </span>
            </Field>
          </dl>

          <p className="mt-7" style={{ color: 'var(--color-text-muted)' }}>
            {/*
              Derived from this voter's actual gate sequence rather than their
              type. If a future configuration gives employees a house contest —
              or gives students a second one — this sentence stays true without
              anyone remembering to edit it.
            */}
            {endsWithHouseGate
              ? `You will vote in ${gateCount} positions, ending with your house captain.`
              : `You will vote in ${gateCount} leadership positions. House captains are voted on by students.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 px-5 pb-8 sm:px-8">
          <Button variant="primary" size="lg" onClick={onConfirm} autoFocus>
            That&apos;s me — start voting
          </Button>
          <Button variant="ghost" size="lg" onClick={onStartOver}>
            Not you? Start over
          </Button>
        </div>
      </BoardPanel>

      <style>{`
        .boarding-pass { animation: pass-in var(--dur-enter) var(--ease-glide) both }
        @keyframes pass-in {
          from { opacity: 0; transform: translateY(16px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pass-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt
        className="font-board uppercase"
        style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.16em', color: 'var(--color-text-dim)' }}
      >
        {label}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
