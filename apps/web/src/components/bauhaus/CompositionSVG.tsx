/**
 * A static Bauhaus composition.
 *
 * The welcome screen's real, readable artwork. It renders instantly, needs no
 * WebGL, and is what a reduced-motion voter sees. The 3D version layers over
 * it as decoration only — this is not a degraded fallback, it is the piece.
 *
 * Asymmetric, gridded, cropped by the frame: elementary forms in primaries with
 * heavy black keylines, after the 1923 exhibition plates.
 */
export function CompositionSVG({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="400" height="300" fill="var(--color-paper)" />

      {/* Ground bars: the structural grid. */}
      <rect x="0" y="252" width="400" height="8" fill="var(--color-ink)" />
      <rect x="248" y="0" width="6" height="300" fill="var(--color-ink)" />

      {/* Blue circle — Kandinsky's pairing. */}
      <circle cx="120" cy="150" r="74" fill="var(--bh-blue)" stroke="var(--color-ink)" strokeWidth="5" />

      {/* Red square, overlapping and cropped. */}
      <rect
        x="182"
        y="38"
        width="108"
        height="108"
        fill="var(--bh-red)"
        stroke="var(--color-ink)"
        strokeWidth="5"
      />

      {/* Yellow triangle. */}
      <path
        d="M300 252 L372 252 L336 178 Z"
        fill="var(--bh-yellow)"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* Green arc, the fourth form. */}
      <path
        d="M36 252 A 46 46 0 0 1 128 252 Z"
        fill="var(--bh-green)"
        stroke="var(--color-ink)"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      {/* A diagonal: the dynamic tension Bauhaus composition relies on. */}
      <path d="M252 300 L400 96" stroke="var(--color-ink)" strokeWidth="5" fill="none" />

      {/* Small black square, off-grid, for balance. */}
      <rect x="316" y="36" width="34" height="34" fill="var(--color-ink)" />
    </svg>
  );
}
