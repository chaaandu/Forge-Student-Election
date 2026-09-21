import { useEffect, useState } from 'react';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { Button } from '@/components/ui/Button';
import { BOARD, COPY } from '@/lib/copy';

export interface DepartedScreenProps {
  /** Seconds to hold before resetting for the next voter. */
  holdSeconds: number;
  onFinished: () => void;
}

/**
 * Wheels up.
 *
 * Two rules, both load-bearing:
 *   1. This screen is only ever rendered after the server confirmed the vote.
 *      There is no timer path to it (enforced in the state machine).
 *   2. It shows NO selections. This is a shared machine and the next voter may
 *      be standing right behind them.
 */
export function DepartedScreen({ holdSeconds, onFinished }: DepartedScreenProps) {
  const [visibleLines, setVisibleLines] = useState(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < COPY.departed.length; i += 1) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), i * 700));
    }
    timers.push(setTimeout(onFinished, holdSeconds * 1000));
    return () => timers.forEach(clearTimeout);
  }, [holdSeconds, onFinished]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BoardPanel>
        <div className="flex flex-col items-center gap-6 px-5 py-12 text-center sm:px-8">
          <SplitFlap text="VOTE CAST" size="xl" tone="go" announce />
          <SplitFlap text={`STATUS: ${BOARD.departed}`} size="md" tone="go" />

          <ul className="m-0 mt-4 flex list-none flex-col items-center gap-3 p-0">
            {COPY.departed.slice(0, visibleLines).map((line) => (
              <li key={line}>
                <SplitFlap text={line.toUpperCase()} size="sm" tone="neutral" />
              </li>
            ))}
          </ul>

          <p className="mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Thank you for voting. This screen will reset for the next person.
          </p>

          <Button variant="ghost" onClick={onFinished} autoFocus>
            Finish now
          </Button>
        </div>
      </BoardPanel>
    </div>
  );
}
