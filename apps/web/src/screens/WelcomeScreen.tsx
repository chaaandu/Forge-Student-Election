import type { PublicElection } from '@/lib/api';
import { BoardHeader } from '@/components/board/BoardHeader';
import { BoardPanel } from '@/components/board/BoardPanel';
import { BoardRow } from '@/components/board/BoardRow';
import { Button } from '@/components/ui/Button';
import { BOARD } from '@/lib/copy';

export interface WelcomeScreenProps {
  election: PublicElection;
  onCheckIn: () => void;
  isDevelopmentMode: boolean;
}

/**
 * The departure hall.
 *
 * This is the screen the next voter walks up to, so it is also the reset state:
 * calm, one obvious action, and nothing left over from the person before.
 * Ambient motion is limited to the blinking status light — no constant noise.
 */
export function WelcomeScreen({ election, onCheckIn, isDevelopmentMode }: WelcomeScreenProps) {
  const destinations = election.positions
    .filter((p) => p.kind === 'leadership')
    .sort((a, b) => a.order - b.order);
  const houseCount = election.positions.filter((p) => p.kind === 'house-captain').length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <BoardPanel>
        <BoardHeader title="MESA ELECTIONS 2026" status={BOARD.boarding} tone="go" />

        <div role="table" aria-label="Positions in this election">
          <div
            role="row"
            className="grid gap-4 px-4 py-2 sm:px-6"
            style={{
              gridTemplateColumns: 'minmax(0,1fr) auto auto',
              fontSize: 'var(--text-2xs)',
              letterSpacing: '0.18em',
              color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-board)',
              textTransform: 'uppercase',
            }}
          >
            <span role="columnheader">Destination</span>
            <span role="columnheader" className="hidden sm:inline">
              Gate
            </span>
            <span role="columnheader" className="text-right">
              Status
            </span>
          </div>

          {destinations.map((position, index) => (
            <BoardRow
              key={position.id}
              destination={position.shortTitle ?? position.title}
              gate={`GATE ${String(index + 1).padStart(2, '0')}`}
              status="OPEN"
              tone="go"
            />
          ))}

          {houseCount > 0 && (
            <BoardRow
              destination="House Captains"
              gate="CONCOURSE"
              status="STUDENTS"
              tone="signal"
            />
          )}
        </div>

        <div className="flex flex-col items-center gap-5 px-4 py-9 sm:px-6">
          <Button variant="primary" size="lg" onClick={onCheckIn} autoFocus>
            Check in to vote
          </Button>
          <p
            className="max-w-sm text-center"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}
          >
            {election.election.name}. It takes about two minutes. You can change your choices
            right up until you submit.
          </p>
        </div>
      </BoardPanel>

      {houseCount > 0 && (
        <p
          className="text-center"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}
        >
          Students also vote for their own house captain. Employees vote for the leadership
          positions.
        </p>
      )}

      {isDevelopmentMode && <DevelopmentBanner />}
    </div>
  );
}

export function DevelopmentBanner() {
  return (
    <p
      role="status"
      className="mx-auto max-w-xl rounded-[var(--radius-control)] px-4 py-3 text-center font-board uppercase"
      style={{
        fontSize: 'var(--text-2xs)',
        letterSpacing: '0.14em',
        color: 'var(--color-stop)',
        background: 'var(--color-stop-soft)',
        border: '1px solid var(--color-stop)',
      }}
    >
      Development mode — identity is not verified and votes are not real
    </p>
  );
}
