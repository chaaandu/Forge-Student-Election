import { Shape } from '@/components/bauhaus/Shape';

/**
 * The Mesa mark.
 *
 * Placeholder: the three elementary forms in the three primaries, which is both
 * the Bauhaus signature and a reasonable stand-in until real brand assets land.
 * Swap this component and the `--bh-*` tokens; nothing else references it.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="inline-flex items-end gap-1">
        <Shape form="square" size={13} color="var(--bh-red)" />
        <Shape form="circle" size={13} color="var(--bh-blue)" />
        <Shape form="triangle" size={13} color="var(--bh-yellow)" />
      </span>
      {!compact && <span className="label">Mesa School of Business</span>}
    </span>
  );
}
