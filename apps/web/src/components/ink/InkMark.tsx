import { useId } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type InkMarkSize = 'sm' | 'md' | 'lg';

export interface InkMarkProps {
  /** Renders nothing when false, so the mark appears and disappears cleanly. */
  marked: boolean;
  size?: InkMarkSize;
  color?: string;
  /** Accessible name. Omit where an adjacent label already says "Selected". */
  label?: string;
}

const SIZES: Record<InkMarkSize, number> = { sm: 22, md: 32, lg: 44 };

/**
 * The mark you make on a ballot.
 *
 * The signature interaction of the whole interface: a hand-drawn ink check that
 * draws itself in one stroke, as if someone had just put a pen to paper. It
 * replaces the usual tick glyph because a tick is a UI convention, and this is
 * meant to feel like an act.
 *
 * The path is deliberately imperfect — the stroke overshoots slightly and the
 * legs differ in length — because a geometrically perfect mark reads as a logo
 * rather than as handwriting.
 *
 * Decorative by default. Selection is also carried by `aria-checked` on the
 * card, by its border, and by the literal word "Selected", so the mark is never
 * the only signal and never a colour-only one.
 */
export function InkMark({ marked, size = 'md', color, label }: InkMarkProps) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');

  if (!marked) return null;

  const box = SIZES[size];
  const stroke = color ?? 'var(--color-mark)';

  return (
    <svg
      width={box}
      height={box}
      viewBox="0 0 40 40"
      fill="none"
      className="ink-mark"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        {/* A faint wobble, so the stroke edge is not mechanically straight. */}
        <filter id={`ink-${id}`} x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feDisplacementMap
            in="SourceGraphic"
            scale="0.8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <path
        d="M7.5 21.5 C 11 24.2, 13.6 27.4, 16.4 31.8 C 21.2 22.4, 26.6 14.1, 34 7.4"
        stroke={stroke}
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#ink-${id})`}
        style={
          reduced
            ? undefined
            : {
                strokeDasharray: 58,
                strokeDashoffset: 58,
                animation: 'ink-draw var(--dur-mark) var(--ease-ink) forwards',
              }
        }
      />

      <style>{`
        @keyframes ink-draw { to { stroke-dashoffset: 0 } }
        .ink-mark { overflow: visible }
      `}</style>
    </svg>
  );
}
