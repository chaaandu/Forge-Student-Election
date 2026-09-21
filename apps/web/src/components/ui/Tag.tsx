import type { ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  color?: string;
}

/** A small printed label, as stamped on a form. */
export function Tag({ children, color }: TagProps) {
  const accent = color ?? 'var(--color-ink-soft)';
  return (
    <span
      className="label inline-flex items-center"
      style={{
        color: accent,
        padding: '4px 9px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${accent}40`,
        background: `${accent}0F`,
      }}
    >
      {children}
    </span>
  );
}
