import { useEffect } from 'react';
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

  useEffect(() => {
    const timer = setTimeout(onFinished, holdSeconds * 1000);
    return () => clearTimeout(timer);
  }, [holdSeconds, onFinished]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/*
        No burst, and no line-by-line reveal.

        The shapes were scattered at random and the three lines typed themselves
        in over nearly two seconds — on a shared kiosk, with the next voter
        already waiting. A confirmation should be readable the instant it
        appears and then get out of the way. The green block and the headline do
        the whole job; everything else was decoration on top of a receipt.
      */}
      <div className="panel panel--raised relative overflow-hidden">
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

          <ul className="flex list-none flex-col gap-2.5 p-0">
            {COPY.done.map((line) => (
              <li key={line} style={{ fontSize: 'var(--text-md)', color: 'var(--color-ink-soft)' }}>
                {line}
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-faint)' }}>
            This screen clears in a moment for the next person.
          </p>

          <Button variant="secondary" onClick={onFinished} autoFocus>
            Done
          </Button>
        </div>
      </div>

    </div>
  );
}
