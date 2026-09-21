import type { ReactNode } from 'react';

export interface BoardPanelProps {
  children: ReactNode;
  className?: string;
  /** Renders the mechanical frame. Off for plain content areas. */
  framed?: boolean;
}

/** The departure-board surface: flat, dark, hairline-framed. No gradients, no glass. */
export function BoardPanel({ children, className = '', framed = true }: BoardPanelProps) {
  return (
    <div
      className={`board-grain ${className}`}
      style={{
        background: framed ? 'var(--color-board)' : 'transparent',
        border: framed ? '1px solid var(--color-line)' : 'none',
        borderRadius: 'var(--radius-card)',
      }}
    >
      {children}
    </div>
  );
}
