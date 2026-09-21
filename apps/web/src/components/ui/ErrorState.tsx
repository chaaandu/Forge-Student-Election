import { Button } from './Button';

export interface ErrorStateProps {
  /** Plain language. Always the meaning, never decoration to decode. */
  headline: string;
  message: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tone?: 'alert' | 'notice';
}

/**
 * Every failure state renders through here.
 *
 * A stamped notice on the ballot: a red rule, a plain headline, and a sentence
 * saying what happened and what to do. There is no bare "Something went wrong"
 * anywhere in this system.
 */
export function ErrorState({
  headline,
  message,
  action,
  secondaryAction,
  tone = 'alert',
}: ErrorStateProps) {
  const accent = tone === 'alert' ? 'var(--color-alert)' : 'var(--color-ink-soft)';

  return (
    <div
      role="alert"
      className="sheet mx-auto w-full max-w-xl overflow-hidden"
      style={{ borderColor: `${accent}55` }}
    >
      <div style={{ height: 4, background: accent }} aria-hidden="true" />

      <div className="px-7 py-8 text-center sm:px-9">
        <h2 style={{ fontSize: 'var(--text-xl)', color: 'var(--color-ink)' }}>{headline}</h2>

        <p
          className="mx-auto mt-4 max-w-md"
          style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink-soft)' }}
        >
          {message}
        </p>

        {(action || secondaryAction) && (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {action && (
              <Button variant="primary" size="lg" onClick={action.onClick}>
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button variant="quiet" size="lg" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
