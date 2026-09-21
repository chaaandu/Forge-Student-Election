import type { Position } from '@mesa/election-core';

export interface RouteLineProps {
  steps: Position[];
  currentIndex: number;
  selections: Record<string, string>;
}

/**
 * The route: one stop per gate in this voter's own journey.
 *
 * The stop count is the voter's real total — an employee sees six stops, never
 * six of ten. The textual "Gate n of m" beside it is the accessible version:
 * the dots are decoration.
 */
export function RouteLine({ steps, currentIndex, selections }: RouteLineProps) {
  return (
    <div className="flex items-center gap-4">
      <p
        className="shrink-0 font-board uppercase"
        style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.16em', color: 'var(--color-text-muted)' }}
      >
        Gate {currentIndex + 1} of {steps.length}
      </p>

      <ol aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-0">
        {steps.map((step, index) => {
          const done = Boolean(selections[step.id]);
          const current = index === currentIndex;
          const colour = current
            ? 'var(--color-signal)'
            : done
              ? 'var(--color-go)'
              : 'var(--color-line)';

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <span
                className={current ? 'route-stop route-stop--current' : 'route-stop'}
                style={{
                  background: done || current ? colour : 'transparent',
                  borderColor: colour,
                }}
              />
              {index < steps.length - 1 && (
                <span
                  className="h-px min-w-2 flex-1"
                  style={{ background: done ? 'var(--color-go)' : 'var(--color-line)' }}
                />
              )}
            </li>
          );
        })}
      </ol>

      <style>{`
        .route-stop {
          width: 9px; height: 9px; border-radius: 50%;
          border: 1.5px solid; display: inline-block; flex: none;
          transition: background-color 180ms var(--ease-glide), border-color 180ms var(--ease-glide);
        }
        .route-stop--current { animation: route-pulse 2s var(--ease-glide) infinite; }
        @keyframes route-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @media (prefers-reduced-motion: reduce) { .route-stop--current { animation: none } }
      `}</style>
    </div>
  );
}
