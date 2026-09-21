import { SplitFlap } from './SplitFlap';

export interface BoardRowProps {
  /** Left column — the destination. */
  destination: string;
  /** Middle column — the gate number. */
  gate?: string;
  /** Right column — the status word. */
  status: string;
  tone?: 'signal' | 'go' | 'stop' | 'neutral';
  /** Tile count for the destination column, so rows align. */
  destinationWidth?: number;
  animate?: boolean;
}

/**
 * One row of the departure board.
 *
 * Reads as a single sentence to a screen reader — "President, gate 01, open" —
 * rather than three disconnected fragments, because each SplitFlap contributes
 * its own hidden real text in order.
 */
export function BoardRow({
  destination,
  gate,
  status,
  tone = 'signal',
  destinationWidth = 22,
  animate = true,
}: BoardRowProps) {
  return (
    <div
      className="grid items-center gap-4 px-4 py-3 sm:px-6"
      style={{
        gridTemplateColumns: gate ? 'minmax(0,1fr) auto auto' : 'minmax(0,1fr) auto',
        borderTop: '1px solid var(--color-line)',
      }}
    >
      <div className="min-w-0 overflow-hidden">
        {animate ? (
          <SplitFlap text={destination.toUpperCase()} width={destinationWidth} size="sm" tone="neutral" />
        ) : (
          <span
            className="font-board uppercase"
            style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.04em' }}
          >
            {destination}
          </span>
        )}
      </div>

      {gate && (
        <div className="hidden sm:block" style={{ color: 'var(--color-text-dim)' }}>
          <SplitFlap text={gate.toUpperCase()} size="sm" tone="neutral" />
        </div>
      )}

      <div className="text-right">
        <SplitFlap text={status.toUpperCase()} size="sm" tone={tone} width={9} />
      </div>
    </div>
  );
}
