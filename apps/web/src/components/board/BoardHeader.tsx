import { SplitFlap } from './SplitFlap';
import { StatusLight } from '@/components/ui/StatusLight';
import { Wordmark } from '@/components/ui/Wordmark';

export interface BoardHeaderProps {
  title: string;
  status: string;
  tone?: 'signal' | 'go' | 'stop';
  /** Announce the status change to screen readers. */
  announce?: boolean;
  titleWidth?: number;
}

/** The board masthead: title on the left, live status on the right. */
export function BoardHeader({
  title,
  status,
  tone = 'signal',
  announce = true,
  titleWidth,
}: BoardHeaderProps) {
  return (
    <header className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Wordmark />
        <span className="flex items-center gap-2">
          <StatusLight tone={tone === 'stop' ? 'stop' : tone === 'signal' ? 'signal' : 'go'} label={`Status: ${status}`} />
          <span
            className="font-board uppercase"
            style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.18em', color: 'var(--color-text-dim)' }}
          >
            Status
          </span>
          <SplitFlap text={status} tone={tone} size="sm" announce={announce} />
        </span>
      </div>

      <h1 className="m-0">
        <SplitFlap text={title} size="xl" tone="signal" {...(titleWidth ? { width: titleWidth } : {})} />
      </h1>
    </header>
  );
}
