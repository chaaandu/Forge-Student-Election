import { Panel } from '@/components/bauhaus/Panel';

/**
 * In flight.
 *
 * The progress bar is indeterminate on purpose: we do not know how long the
 * server will take, and a bar implying known progress would be a small lie at
 * the most sensitive moment in the app.
 */
export function SubmittingScreen({ attempt }: { attempt: number }) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <Panel raised>
        <div className="flex flex-col items-center gap-7 px-7 py-16 text-center sm:px-9">
          <h1 className="poster" style={{ fontSize: 'var(--text-xl)' }}>
            Recording your vote
          </h1>

          <div
            aria-hidden="true"
            className="sweep w-full max-w-xs overflow-hidden"
            style={{ height: 10, border: '3px solid var(--color-ink)', background: 'var(--color-card)' }}
          >
            <span className="sweep__bar" />
          </div>

          <p role="status" style={{ color: 'var(--color-ink-soft)' }}>
            {attempt > 1
              ? `Still going — attempt ${attempt}. Do not close this screen.`
              : 'This takes a second. Do not close this screen.'}
          </p>
        </div>
      </Panel>

      <style>{`
        .sweep__bar {
          display: block; height: 100%; width: 36%;
          background: var(--bh-red);
          animation: sweep 1.15s var(--ease-out) infinite;
        }
        @keyframes sweep { from { transform: translateX(-100%) } to { transform: translateX(320%) } }
        @media (prefers-reduced-motion: reduce) {
          .sweep__bar { animation: none; width: 100%; opacity: .45 }
        }
      `}</style>
    </div>
  );
}
