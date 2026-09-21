import type { ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Adds the hard offset block. For the one thing in focus on a screen. */
  raised?: boolean;
  as?: 'div' | 'section' | 'article';
}

/**
 * A panel: heavy black keyline, hard offset block, no radius, no blur.
 *
 * Depth expressed the way a print shop expresses it — by offsetting a second
 * impression — rather than by simulating a light source.
 */
export function Panel({ children, className = '', raised = false, as = 'div' }: PanelProps) {
  const Tag = as;
  return <Tag className={`panel ${raised ? 'panel--raised' : ''} ${className}`}>{children}</Tag>;
}
