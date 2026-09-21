import type { HouseShape } from '@mesa/election-core';

export interface ShapeProps {
  form: HouseShape;
  /** The reference size: the side of a square carrying the same ink. */
  size?: number;
  color?: string;
  outline?: boolean;
  strokeWidth?: number;
  /**
   * Scale each form so it carries the same ink as a square of `size`.
   *
   * On by default, because equal bounding boxes are NOT equal visual weight: at
   * the same box a circle covers 79% of a square, a triangle 50%, a semicircle
   * 39%. Lined up together the arc all but disappears. Equalising area makes
   * the boxes differ instead — which is the correct trade, since weight is what
   * the eye reads.
   *
   * Turn it off only where a form must fit an exact box.
   */
  opticalWeight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Area of each form within a unit bounding box. */
const AREA: Record<HouseShape, number> = {
  square: 1,
  circle: Math.PI / 4, // 0.785
  triangle: 0.5,
  arc: Math.PI / 8, // 0.393
};

/** Scale that brings each form to the ink of a square. */
export function opticalScale(form: HouseShape): number {
  return Math.sqrt(1 / AREA[form]);
}

/**
 * An elementary form.
 *
 * Square, circle, triangle and arc — the Bauhaus vocabulary, and after
 * Kandinsky's correspondence the natural partners of red, blue and yellow.
 * Used for house identity and the celebration burst.
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
  opticalWeight = true,
  className = '',
  style,
}: ShapeProps) {
  const box = opticalWeight ? size * opticalScale(form) : size;
  const fill = outline ? 'none' : color;
  const stroke = outline ? color : 'none';
  // Outlines carry their weight in the stroke, so the inset keeps it inside.
  const inset = outline ? strokeWidth / 2 : 0;

  return (
    <svg
      width={box}
      height={box}
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
