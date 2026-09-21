import type { ReactNode } from 'react';

export interface SheetProps {
  children: ReactNode;
  className?: string;
  /** Lifts the sheet slightly, for the one thing in focus on a screen. */
  raised?: boolean;
  as?: 'div' | 'section' | 'article';
}

/**
 * A sheet of paper.
 *
 * Every screen is one or more of these. Flat stock, hairline edge, and the
 * close warm shadow a real sheet casts on a desk — not a drop-shadow effect.
 */
export function Sheet({ children, className = '', raised = false, as = 'div' }: SheetProps) {
  const Tag = as;
  return (
    <Tag
      className={`sheet ${className}`}
      style={raised ? { boxShadow: 'var(--shadow-lift)' } : undefined}
    >
      {children}
    </Tag>
  );
}
