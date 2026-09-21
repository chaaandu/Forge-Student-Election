import type { HouseShape } from '@mesa/election-core';

export interface ShapeProps {
  form: HouseShape;
  size?: number;
  color?: string;
  /** Outline instead of a solid field. */
  outline?: boolean;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * An elementary form.
 *
 * Square, circle, triangle and arc — the Bauhaus vocabulary, and after
 * Kandinsky's correspondence the natural partners of red, blue and yellow. Used
 * for house identity, progress tokens and the celebration burst.
 *
 * Always decorative: every shape in this interface sits beside a word that says
 * the same thing.
 */
export function Shape({
  form,
  size = 24,
  color = 'currentColor',
  outline = false,
  strokeWidth = 3,
  className = '',
  style,
}: ShapeProps) {
  const fill = outline ? 'none' : color;
  const stroke = outline ? color : 'none';
  const inset = outline ? strokeWidth / 2 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...(style ? { style } : {})}
    >
      {form === 'square' && (
        <rect
          x={inset}
          y={inset}
          width={32 - inset * 2}
          height={32 - inset * 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}

      {form === 'circle' && (
        <circle cx="16" cy="16" r={16 - inset} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      )}

      {form === 'triangle' && (
        <path
          d={`M16 ${inset} L${32 - inset} ${32 - inset} L${inset} ${32 - inset} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}

      {/* The half-disc: Bauhaus composition's fourth form. */}
      {form === 'arc' && (
        <path
          d={`M${inset} ${32 - inset} A ${16 - inset} ${16 - inset} 0 0 1 ${32 - inset} ${32 - inset} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
