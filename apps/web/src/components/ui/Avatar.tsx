import { accessibleField } from '@/lib/color';

export interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.replace(/['’]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

const sizes = { sm: 40, md: 58, lg: 82 } as const;

/**
 * Initials in a hard-edged block. Decorative: the name is always alongside.
 *
 * WITH NO COLOUR IT IS NEUTRAL, not blue.
 *
 * The default used to be `--bh-blue`, which is also the Samurai field. On the
 * check-in desk — where every student's avatar carries their real house colour
 * so the list can be scanned — that gave the one voter with NO house, an
 * employee, a Samurai-blue block. The only person on screen who belongs to no
 * house was the one being coloured as if she did.
 *
 * Here colour means house and nothing else, so no house means no colour.
 */
export function Avatar({ name, color, size = 'md' }: AvatarProps) {
  const box = sizes[size];
  const adjusted = color?.startsWith('#') ? accessibleField(color) : null;
  const field = adjusted?.field ?? color ?? 'var(--color-paper)';
  const ink = adjusted?.ink ?? 'var(--color-ink)';

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: box,
        height: box,
        fontFamily: 'var(--font-geometric)',
        fontWeight: 600,
        fontSize: box * 0.38,
        letterSpacing: '0.02em',
        background: field,
        color: ink,
        border: '3px solid var(--color-ink)',
      }}
    >
      {initials(name)}
    </span>
  );
}
