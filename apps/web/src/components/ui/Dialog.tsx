import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in the footer; the first focusable receives focus on open. */
  actions: ReactNode;
}

/**
 * A focus-trapped modal.
 *
 * Deliberately hand-rolled rather than `<dialog>`: we need the initial focus to
 * land on the *safe* action (Go back), Escape to mean "go back", and a trap
 * that cannot be tabbed out of — a voter must not be able to wander behind the
 * final confirmation.
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const items = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.7)' }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="board-grain w-full max-w-lg p-7"
        style={{
          background: 'var(--color-board)',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-modal)',
          animation: 'dialog-in var(--dur-enter) var(--ease-glide) both',
        }}
      >
        <h2
          id="dialog-title"
          className="font-board uppercase"
          style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.18em', color: 'var(--color-signal)' }}
        >
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
      </div>

      <style>{`
        @keyframes dialog-in {
          from { opacity: 0; transform: scale(.96) }
          to { opacity: 1; transform: scale(1) }
        }
      `}</style>
    </div>
  );
}
