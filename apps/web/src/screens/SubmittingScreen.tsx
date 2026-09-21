import { BoardPanel } from '@/components/board/BoardPanel';
import { SplitFlap } from '@/components/board/SplitFlap';
import { BOARD } from '@/lib/copy';

/**
 * In flight.
 *
 * The progress bar is indeterminate on purpose: we do not know how long the
 * server will take, and a bar that implies known progress is a small lie at the
 * most sensitive moment in the app.
 */
export function SubmittingScreen({ attempt }: { attempt: number }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <BoardPanel>
        <div className="flex flex-col items-center gap-6 px-5 py-14 text-center sm:px-8">
          <SplitFlap text={`STATUS: ${BOARD.departing}`} size="lg" tone="signal" announce />

          <div
            aria-hidden="true"
            className="sweep w-full max-w-sm overflow-hidden"
            style={{ height: 3, background: 'var(--color-line)', borderRadius: 2 }}
          >
            <span className="sweep__bar" />
          </div>

          <p role="status" style={{ color: 'var(--color-text-muted)' }}>
            {attempt > 1
              ? `Still sending your vote (attempt ${attempt}). Please do not close this screen.`
              : 'Sending your vote. Please do not close this screen.'}
          </p>
        </div>
      </BoardPanel>

      <style>{`
        .sweep__bar {
          display: block; height: 100%; width: 38%;
          background: var(--color-signal);
          animation: sweep 1.1s var(--ease-glide) infinite;
        }
        @keyframes sweep {
          from { transform: translateX(-100%) }
          to { transform: translateX(300%) }
        }
        @media (prefers-reduced-motion: reduce) {
          .sweep__bar { animation: none; width: 100%; opacity: .5 }
        }
      `}</style>
    </div>
  );
}
