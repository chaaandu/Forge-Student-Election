import type { ReactNode } from 'react';
import { accessibleField } from '@/lib/color';

export interface TagProps {
  children: ReactNode;
  /**
   * A literal hex field colour — reserved for HOUSE IDENTITY. Ink on it is
   * chosen automatically. Do not reach for this to make a tag look important.
   */
  color?: string;
  /** Which surface the tag is sitting on. */
  tone?: 'ink' | 'paper';
}

/**
 * A stamped block. Type on a field is black or white — never a tint of it.
 *
 * ONE RULE, because there were three.
 *
 * The identity screen used to carry `STUDENT` as a black field, `KNIGHTS` as a
 * house field and `7 POSITIONS` as a yellow one, side by side in a single row:
 * three treatments chosen a tag at a time, which reads as decoration rather
 * than as a system. A voter cannot learn what a colour means if it means
 * something different in each tag.
 *
 * So:
 *
 *   - a tag is an INK field, or a PAPER one when it sits on ink;
 *   - `color` is only ever passed to carry a house, where the colour IS the
 *     information and is already established by the crest beside it.
 *
 * Anything that is merely a fact rather than an identity — how many positions
 * are on this ballot — belongs in the sentence, not in a coloured block.
 */
export function Tag({ children, color, tone = 'ink' }: TagProps) {
  const adjusted = color?.startsWith('#') ? accessibleField(color) : null;

  const field = adjusted?.field ?? (tone === 'paper' ? 'var(--color-paper)' : 'var(--color-ink)');
  const ink = adjusted?.ink ?? (tone === 'paper' ? 'var(--color-ink)' : 'var(--color-paper)');

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
        // On ink, the keyline would disappear into the surface behind it; the
        // field already has its own edge there.
        border: tone === 'paper' && !adjusted ? 'none' : '2px solid var(--color-ink)',
      }}
    >
      {children}
    </span>
  );
}
