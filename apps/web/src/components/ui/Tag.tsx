import type { ReactNode } from 'react';

export interface TagProps {
  children: ReactNode;
  tone?: 'signal' | 'go' | 'stop' | 'neutral' | 'brand';
  color?: string;
}

const tones = {
  signal: 'var(--color-signal)',
  go: 'var(--color-go)',
  stop: 'var(--color-stop)',
  neutral: 'var(--color-text-muted)',
  brand: 'var(--color-brand-soft)',
} as const;

/** Small uppercase label — the "class tag" on a boarding pass. */
export function Tag({ children, tone = 'neutral', color }: TagProps) {
  const accent = color ?? tones[tone];
  return (
    <span
      className="inline-flex items-center font-board uppercase"
      style={{
        fontSize: 'var(--text-2xs)',
        letterSpacing: '0.14em',
        padding: '4px 8px',
        borderRadius: 'var(--radius-flap)',
        color: accent,
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
