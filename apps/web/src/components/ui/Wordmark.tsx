/**
 * The Mesa mark.
 *
 * Placeholder geometry — a mesa, flat-topped, drawn as a single ink stroke.
 * Swap this component and the --color-mark tokens when real brand assets land;
 * nothing else references the mark directly.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-3">
      <svg width="24" height="17" viewBox="0 0 26 18" aria-hidden="true" focusable="false">
        <path
          d="M1 17h24L20 5H12L7 11H1z"
          fill="none"
          stroke="var(--color-mark)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="label" style={{ color: 'var(--color-ink-faint)' }}>
        Mesa School of Business
      </span>
    </span>
  );
}
