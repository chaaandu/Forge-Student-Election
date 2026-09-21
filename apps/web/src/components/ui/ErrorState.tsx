import { SplitFlap } from '@/components/board/SplitFlap';
import { Button } from './Button';

export interface ErrorStateProps {
  /** The themed word, e.g. "DELAYED". Rendered on the board. */
  headline: string;
  /** Plain language. Always present, always first in reading order for a screen reader. */
  message: string;
  /** What the voter can do now. */
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tone?: 'stop' | 'signal';
}

/**
 * Every failure state in the app renders through here.
 *
 * The rule from the theme brief: themed copy must never obscure meaning. The
 * board word is decoration on top of a plain sentence that says what happened
 * and what to do — never a bare "Something went wrong".
 */
export function ErrorState({
  headline,
  message,
  action,
  secondaryAction,
  tone = 'stop',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="board-grain mx-auto w-full max-w-xl p-7 text-center"
      style={{
        background: 'var(--color-board)',
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 34%, var(--color-line))`,
        borderRadius: 'var(--radius-card)',
      }}
    >
      <div className="flex justify-center">
        <SplitFlap text={headline} tone={tone} size="lg" announce />
      </div>

      <p
        className="mx-auto mt-5 max-w-md"
        style={{ fontSize: 'var(--text-md)', color: 'var(--color-text)' }}
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
            <Button variant="ghost" size="lg" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
