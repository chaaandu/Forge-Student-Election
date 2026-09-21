export interface StatusLightProps {
  tone?: 'signal' | 'go' | 'stop';
  /** The only ambient motion on the welcome screen. */
  pulse?: boolean;
  label: string;
}

const tones = {
  signal: 'var(--color-signal)',
  go: 'var(--color-go)',
  stop: 'var(--color-stop)',
} as const;

export function StatusLight({ tone = 'go', pulse = true, label }: StatusLightProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={pulse ? 'status-light status-light--pulse' : 'status-light'}
        style={{ background: tones[tone] }}
      />
      <span className="sr-only">{label}</span>
      <style>{`
        .status-light { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .status-light--pulse { animation: status-pulse 2s var(--ease-glide) infinite; }
        @keyframes status-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @media (prefers-reduced-motion: reduce) {
          .status-light--pulse { animation: none; }
        }
      `}</style>
    </span>
  );
}
