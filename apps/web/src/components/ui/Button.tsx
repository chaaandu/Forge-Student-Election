import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  /** Why the button is disabled, in plain words. Announced, and usually shown too. */
  disabledReason?: string;
  children: ReactNode;
}

/**
 * A printer's block.
 *
 * Solid field, heavy keyline, hard offset. Pressing it drives the block into
 * its own shadow — the whole control moves, which is far more satisfying than a
 * colour change and needs no extra pixels to express.
 */
const base =
  'bh-button relative inline-flex items-center justify-center gap-2.5 select-none ' +
  'font-semibold uppercase tracking-[0.1em] ' +
  'border-[3px] border-[var(--color-ink)] rounded-none ' +
  'transition-[transform,box-shadow,background-color] duration-150 ' +
  'disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // The colour is set as an inline style below, not here: see the note there.
  primary: 'bg-[var(--bh-yellow)]',
  secondary: 'bg-[var(--color-card)] text-[var(--color-ink)]',
  /*
    Underlined, and in full ink rather than soft.

    Without it this variant is transparent, borderless and set at the same
    weight as a label — so the seven `CHANGE` controls down the review screen,
    `Not you? Start again`, and `Back` on the check-in desk all read as static
    text. On a touch kiosk there is no hover to discover them with: a voter
    either believes it is a control or they do not. The underline is the
    cheapest thing that says "this is one" without giving it the weight of a
    block, which is the whole point of the variant.
  */
  quiet:
    'bg-transparent border-transparent text-[var(--color-ink)] shadow-none ' +
    'underline decoration-2 underline-offset-4',
  danger: 'bg-[var(--bh-red)] text-white',
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
      ? 'text-[var(--text-sm)] px-8 py-4'
      : 'text-[var(--text-xs)] px-5 py-3';

  const reasonId = `${rest.id ?? 'btn'}-reason`;

  return (
    <>
      <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={isDisabled && disabledReason ? reasonId : undefined}
      data-variant={variant}
      className={`${base} ${variants[variant]} ${sizing} ${className}`}
      style={{
        fontFamily: 'var(--font-geometric)',
        minHeight: 'var(--hit)',
        minWidth: 'var(--hit)',
        /*
          The primary's field is a FIXED yellow, so its type is a fixed black —
          on both grounds. It cannot follow --color-ink, which inverts to cream
          at night and made the primary action of every screen 1.39:1.

          Set here rather than as a Tailwind arbitrary class because the class
          did not survive: it competes with `button { color: inherit }` and with
          the variant strings, and the measured result was cream regardless.
          An inline style is unambiguous, and this is the one control in the app
          where getting it wrong hides the button a voter needs most.

          An inline style beats the `:disabled` rule in the stylesheet, so it is
          scoped to the enabled state — otherwise a disabled primary keeps the
          fixed black and sits on the dark sunk field at 1.09:1.
        */
        ...(variant === 'primary' && !isDisabled ? { color: 'var(--color-ink-fixed)' } : {}),
        ...rest.style,
      }}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}

      <style>{`
        .bh-button:not([data-variant="quiet"]) { box-shadow: var(--shadow-block-sm); }
        .bh-button:not([data-variant="quiet"]):hover:not(:disabled) {
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0 var(--color-ink);
        }
        /* Press drives the block down into its own shadow. */
        .bh-button:not([data-variant="quiet"]):active:not(:disabled) {
          transform: translate(4px, 4px);
          box-shadow: 0 0 0 var(--color-ink);
        }
        .bh-button[data-variant="quiet"]:hover:not(:disabled) {
          background: var(--color-sunk);
          border-color: var(--color-ink);
          text-decoration-color: var(--color-mark);
        }
        /* --color-ink-faint is documented "large text only, never body", and a
           disabled label is 15px body. It measured 3.47:1 on paper. */
        .bh-button:disabled {
          background: var(--color-sunk);
          color: var(--color-ink-soft);
          border-color: var(--color-ink-faint);
          box-shadow: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .bh-button:hover:not(:disabled), .bh-button:active:not(:disabled) { transform: none }
        }
      `}</style>
      </button>

      {/*
        Rendered OUTSIDE the button on purpose. As a child it would be
        concatenated into the button's accessible name — "Continue, choose a
        candidate to continue" — which is exactly the kind of noise a screen
        reader user does not need on every focus. As a sibling referenced by
        aria-describedby it is announced as a description instead.
      */}
      {isDisabled && disabledReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}
