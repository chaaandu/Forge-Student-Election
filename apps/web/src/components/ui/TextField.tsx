import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  hideLabel?: boolean;
}

/** A ruled field on a form: sunk paper, a hairline, ink you write into. */
export function TextField({
  label,
  hint,
  error,
  hideLabel = false,
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'}>
        {label}
      </label>

      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
        }
        className={`w-full px-4 outline-none transition-colors ${className}`}
        style={{
          minHeight: 'var(--hit)',
          paddingBlock: '12px',
          borderRadius: 'var(--radius-control)',
          border: `1px solid ${error ? 'var(--color-alert)' : 'var(--color-rule-strong)'}`,
          background: 'var(--color-sheet-sunk)',
          color: 'var(--color-ink)',
          fontSize: 'var(--text-md)',
        }}
      />

      {hint && !error && (
        <p id={hintId} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-soft)' }}>
          {hint}
        </p>
      )}

      {/* Errors are never colour-only: a glyph and plain words carry the meaning. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-alert)' }}
        >
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
