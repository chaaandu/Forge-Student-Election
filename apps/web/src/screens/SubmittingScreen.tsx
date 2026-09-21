import { Sheet } from '@/components/paper/Sheet';

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
      <Sheet raised>
        <div className="flex flex-col items-center gap-6 px-7 py-14 text-center sm:px-9">
          <h1 style={{ fontSize: 'var(--text-lg)' }}>Recording your vote…</h1>

          <div
            aria-hidden="true"
            className="sweep w-full max-w-xs overflow-hidden"
            style={{ height: 3, background: 'var(--color-rule)', borderRadius: 2 }}
          >
            <span className="sweep__bar" />
          </div>

          <p role="status" style={{ color: 'var(--color-ink-soft)' }}>
            {attempt > 1
              ? `Still sending (attempt ${attempt}). Please do not close this screen.`
              : 'Please do not close this screen.'}
          </p>
        </div>
      </Sheet>

      <style>{`
        .sweep__bar {
          display: block; height: 100%; width: 36%;
          background: var(--color-mark);
          animation: sweep 1.15s var(--ease-paper) infinite;
        }
        @keyframes sweep { from { transform: translateX(-100%) } to { transform: translateX(320%) } }
        @media (prefers-reduced-motion: reduce) {
          .sweep__bar { animation: none; width: 100%; opacity: .45 }
        }
      `}</style>
    </div>
  );
}
