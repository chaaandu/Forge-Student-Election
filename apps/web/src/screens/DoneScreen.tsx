import { useEffect, useState } from 'react';
import { Sheet } from '@/components/paper/Sheet';
import { InkMark } from '@/components/ink/InkMark';
import { Button } from '@/components/ui/Button';
import { COPY } from '@/lib/copy';

export interface DoneScreenProps {
  /** Seconds to hold before resetting for the next voter. */
  holdSeconds: number;
  onFinished: () => void;
}

/**
 * Done.
 *
 * Two rules, both load-bearing:
 *   1. This screen renders only after the server confirmed the vote. There is
 *      no timer path to it — the state machine makes it unreachable otherwise.
 *   2. It shows NO selections. This is a shared machine and the next voter may
 *      be standing right behind them.
 */
export function DoneScreen({ holdSeconds, onFinished }: DoneScreenProps) {
  const [visibleLines, setVisibleLines] = useState(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < COPY.done.length; i += 1) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), i * 650));
    }
    timers.push(setTimeout(onFinished, holdSeconds * 1000));
    return () => timers.forEach(clearTimeout);
  }, [holdSeconds, onFinished]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <Sheet raised>
        <div className="flex flex-col items-center gap-6 px-7 py-14 text-center sm:px-9">
          <span
            className="flex items-center justify-center"
            style={{
              width: 78,
              height: 78,
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--color-confirm)',
            }}
          >
            <InkMark marked size="lg" color="var(--color-confirm)" label="Vote recorded" />
          </span>

          <h1 style={{ fontSize: 'var(--text-2xl)' }}>Vote recorded</h1>

          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite">
            {COPY.done.slice(0, visibleLines).map((line) => (
              <li
                key={line}
                className="done-line"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-ink-soft)' }}
              >
                {line}
              </li>
            ))}
          </ul>

          <div className="perforation w-full" aria-hidden="true" />

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-faint)' }}>
            Thank you for voting. This screen resets for the next person.
          </p>

          <Button variant="quiet" onClick={onFinished} autoFocus>
            Finish now
          </Button>
        </div>
      </Sheet>

      <style>{`
        .done-line { animation: line-in 320ms var(--ease-paper) both }
        @keyframes line-in {
          from { opacity: 0; transform: translateY(5px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes line-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
