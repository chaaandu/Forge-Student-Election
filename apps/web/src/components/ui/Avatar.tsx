export interface AvatarProps {
  name: string;
  /** House or brand colour. Falls back to the signal amber. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const sizes = {
  sm: { box: 36, text: 'var(--text-xs)' },
  md: { box: 56, text: 'var(--text-md)' },
  lg: { box: 76, text: 'var(--text-lg)' },
} as const;

/** Initials avatar. Decorative — the name is always rendered alongside it. */
export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  const { box, text } = sizes[size];
  const accent = color ?? 'var(--color-signal)';

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center font-board font-bold"
      style={{
        width: box,
        height: box,
        fontSize: text,
        letterSpacing: '0.06em',
        borderRadius: 'var(--radius-control)',
        color: accent,
        background: `color-mix(in srgb, ${accent} 14%, var(--color-surface))`,
        border: `1px solid color-mix(in srgb, ${accent} 34%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
