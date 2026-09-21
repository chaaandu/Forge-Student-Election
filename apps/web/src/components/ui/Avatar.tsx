export interface AvatarProps {
  name: string;
  /** House colour. Falls back to ink. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.replace(/['’]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const sizes = {
  sm: { box: 38, text: 'var(--text-xs)' },
  md: { box: 56, text: 'var(--text-md)' },
  lg: { box: 78, text: 'var(--text-lg)' },
} as const;

/** Initials, set in the printed face. Decorative: the name is always alongside. */
export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  const { box, text } = sizes[size];
  const accent = color ?? 'var(--color-ink-soft)';

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: box,
        height: box,
        fontSize: text,
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        borderRadius: 'var(--radius-sm)',
        color: accent,
        background: 'var(--color-sheet-sunk)',
        border: `1px solid ${accent}33`,
      }}
    >
      {initials(name)}
    </span>
  );
}
