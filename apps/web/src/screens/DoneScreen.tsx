import { useEffect, useState } from 'react';
import { Burst } from '@/components/bauhaus/Burst';
import { Shape } from '@/components/bauhaus/Shape';
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
 * Three rules, all load-bearing:
 *   1. This screen renders only after the server confirmed the vote. There is
 *      no timer path to it — the state machine makes it unreachable otherwise.
 *   2. It shows NO selections. A shared machine; the next voter may be standing
 *      right behind them.
 *   3. The celebration is for TAKING PART, never for the choice. Elementary
 *      forms assembling, not confetti — confetti reads as a prize, and nothing
 *      here should suggest the voter won something or picked well.
 */
export function DoneScreen({ holdSeconds, onFinished }: DoneScreenProps) {
  const [visibleLines, setVisibleLines] = useState(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < COPY.done.length; i += 1) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), i * 620));
    }
    timers.push(setTimeout(onFinished, holdSeconds * 1000));
    return () => timers.forEach(clearTimeout);
  }, [holdSeconds, onFinished]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="panel panel--raised relative overflow-hidden">
        <Burst />

        <div className="relative flex flex-col items-center gap-7 px-7 py-16 text-center sm:px-10">
          <span
            className="flex items-center justify-center"
            style={{
              width: 92,
              height: 92,
              background: 'var(--bh-green)',
              border: 'var(--rule-weight) solid var(--color-ink)',
            }}
          >
            <Shape form="circle" size={38} color="#FFFFFF" />
          </span>

          <h1 className="poster" style={{ fontSize: 'var(--text-2xl)' }}>
            Vote recorded
          </h1>

          <div className="bar" style={{ width: 120 }} />

          <ul className="flex list-none flex-col gap-2.5 p-0" aria-live="polite">
            {COPY.done.slice(0, visibleLines).map((line) => (
              <li
                key={line}
                className="bh-line"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-ink-soft)' }}
              >
                {line}
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-faint)' }}>
            This screen resets in a moment for the next person.
          </p>

          <Button variant="secondary" onClick={onFinished} autoFocus>
            Done
          </Button>
        </div>
      </div>

      <style>{`
        .bh-line { animation: line-in 300ms var(--ease-snap) both }
        @keyframes line-in {
          from { opacity: 0; transform: translateY(7px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes line-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
