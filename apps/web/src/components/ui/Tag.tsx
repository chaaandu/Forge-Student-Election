import type { ReactNode } from 'react';
import { inkOn } from '@/lib/color';

export interface TagProps {
  children: ReactNode;
  /** A literal hex field colour. Ink on it is chosen automatically. */
  color?: string;
}

/** A stamped block. Type on a field is black or white — never a tint of it. */
export function Tag({ children, color }: TagProps) {
  const field = color ?? 'var(--color-ink)';
  const ink = color?.startsWith('#') ? inkOn(color) : 'var(--color-paper)';

  return (
    <span
      className="inline-flex items-center"
      style={{
        fontFamily: 'var(--font-geometric)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '5px 10px',
        background: field,
        color: ink,
        border: '2px solid var(--color-ink)',
      }}
    >
      {children}
    </span>
  );
}
