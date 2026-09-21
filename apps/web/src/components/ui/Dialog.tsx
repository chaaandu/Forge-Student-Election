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
 * A slip of paper laid over the ballot.
 *
 * Hand-rolled rather than `<dialog>` because initial focus must land on the
 * *safe* action, Escape must mean "go back", and the trap must be absolute — a
 * voter should not be able to wander behind the final confirmation.
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const selector =
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    panel?.querySelectorAll<HTMLElement>(selector)[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const items = panel.querySelectorAll<HTMLElement>(selector);
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
      style={{ background: 'rgb(38 32 20 / 0.34)', backdropFilter: 'saturate(0.85)' }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="sheet w-full max-w-lg p-7 sm:p-9"
        style={{ boxShadow: 'var(--shadow-modal)', animation: 'slip-in var(--dur-enter) var(--ease-paper) both' }}
      >
        <h2 id="dialog-title" style={{ fontSize: 'var(--text-lg)' }}>
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <div className="perforation my-7" aria-hidden="true" />
        <div className="flex flex-wrap gap-3">{actions}</div>
      </div>

      <style>{`
        @keyframes slip-in {
          from { opacity: 0; transform: translateY(10px) rotate(-0.25deg) }
          to   { opacity: 1; transform: translateY(0) rotate(0deg) }
        }
      `}</style>
    </div>
  );
}
