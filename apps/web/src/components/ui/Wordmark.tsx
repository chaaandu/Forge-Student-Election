/**
 * The Mesa mark.
 *
 * Placeholder geometry — a mesa, flat-topped. Swap this component and the
 * --color-brand tokens when real brand assets land; nothing else references the
 * mark directly.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true" focusable="false">
        <path
          d="M1 17h24L20 5H12L7 11H1z"
          fill="none"
          stroke="var(--color-brand-soft)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="font-board uppercase"
        style={{
          fontSize: compact ? 'var(--text-2xs)' : 'var(--text-xs)',
          letterSpacing: '0.24em',
          color: 'var(--color-text-muted)',
        }}
      >
        Mesa School of Business
      </span>
    </span>
  );
}
