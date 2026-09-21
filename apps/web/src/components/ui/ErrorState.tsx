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
 * A stamped plate: a solid field carrying a plain headline, then a sentence
 * saying what happened and what to do. Meaning first, always — there is no bare
 * "Something went wrong" anywhere in this system.
 */
export function ErrorState({
  headline,
  message,
  action,
  secondaryAction,
  tone = 'alert',
}: ErrorStateProps) {
  const field = tone === 'alert' ? 'var(--bh-red)' : 'var(--bh-yellow)';
  const onField = tone === 'alert' ? '#FFFFFF' : 'var(--color-ink)';

  return (
    <div role="alert" className="panel panel--raised mx-auto w-full max-w-xl overflow-hidden">
      <div
        className="px-7 py-5 sm:px-9"
        style={{
          background: field,
          color: onField,
          borderBottom: 'var(--rule-weight) solid var(--color-ink)',
        }}
      >
        <h2 className="poster" style={{ fontSize: 'var(--text-xl)' }}>
          {headline}
        </h2>
      </div>

      <div className="px-7 py-8 text-center sm:px-9">
        <p className="mx-auto max-w-md" style={{ fontSize: 'var(--text-base)' }}>
          {message}
        </p>

        {(action || secondaryAction) && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
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
