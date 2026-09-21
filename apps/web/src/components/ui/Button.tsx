import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  /**
   * Why the button is disabled, in plain words.
   *
   * A disabled control that does not say why is a dead end. This is announced,
   * and the caller usually shows it beside the button as well.
   */
  disabledReason?: string;
  children: ReactNode;
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // A stamp of ink. The one obviously-primary action on any screen.
  primary:
    'bg-[var(--color-ink)] text-[var(--color-sheet)] border border-[var(--color-ink)] ' +
    'hover:bg-[#2c2a24] active:translate-y-px ' +
    'disabled:bg-[var(--color-sheet-sunk)] disabled:text-[var(--color-ink-faint)] ' +
    'disabled:border-[var(--color-rule)]',
  // A printed box you can press.
  secondary:
    'bg-[var(--color-sheet)] text-[var(--color-ink)] border border-[var(--color-rule-strong)] ' +
    'hover:bg-[var(--color-sheet-sunk)] active:translate-y-px ' +
    'disabled:text-[var(--color-ink-faint)] disabled:border-[var(--color-rule)]',
  quiet:
    'bg-transparent text-[var(--color-ink-soft)] border border-transparent ' +
    'hover:text-[var(--color-ink)] hover:bg-[var(--color-sheet-sunk)] underline-offset-4',
  danger:
    'bg-[var(--color-alert)] text-[var(--color-sheet)] border border-transparent ' +
    'hover:brightness-110 active:translate-y-px',
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
      ? 'text-[var(--text-md)] px-7 py-3.5 rounded-[var(--radius-control)]'
      : 'text-[var(--text-sm)] px-5 py-2.5 rounded-[var(--radius-control)]';

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
