import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  /**
   * Why the button is disabled, in plain words.
   *
   * A disabled control that does not say why is a dead end. This is rendered
   * next to the button and announced, so "Continue" is never just inert.
   */
  disabledReason?: string;
  children: ReactNode;
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold tracking-[0.01em] ' +
  'transition-[transform,background-color,border-color,color] duration-150 ' +
  'disabled:cursor-not-allowed select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-signal)] text-[var(--color-signal-ink)] border border-transparent ' +
    'hover:bg-[var(--color-signal-hi)] active:translate-y-px ' +
    'disabled:bg-[var(--color-surface-hi)] disabled:text-[var(--color-text-dim)]',
  secondary:
    'bg-transparent text-[var(--color-text)] border border-[var(--color-line)] ' +
    'hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)] active:translate-y-px ' +
    'disabled:text-[var(--color-text-dim)] disabled:border-[var(--color-line)]',
  ghost:
    'bg-transparent text-[var(--color-text-muted)] border border-transparent ' +
    'hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]',
  danger:
    'bg-[var(--color-stop)] text-[#2A0B08] border border-transparent hover:brightness-110 ' +
    'active:translate-y-px',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  disabledReason,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const sizing =
    size === 'lg'
      ? 'text-[var(--text-md)] px-7 py-4 rounded-[var(--radius-control)]'
      : 'text-[var(--text-sm)] px-5 py-3 rounded-[var(--radius-control)]';

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={isDisabled && disabledReason ? `${rest.id ?? 'btn'}-reason` : undefined}
      className={`${base} ${variants[variant]} ${sizing} ${className}`}
      style={{ minHeight: 'var(--hit)', minWidth: 'var(--hit)', ...rest.style }}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
      {isDisabled && disabledReason && (
        <span id={`${rest.id ?? 'btn'}-reason`} className="sr-only">
          {disabledReason}
        </span>
      )}
    </button>
  );
}
