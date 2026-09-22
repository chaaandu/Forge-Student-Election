import { getMeta, setMeta, type Db } from '../db/index.js';
import type { ElectionRepository } from '../db/electionRepository.js';
import type { ResultsService } from './resultsService.js';

/** The ballot total of the last snapshot queued, so a restart does not repeat it. */
const MARKER = 'results.published.ballots';

export interface ResultsPublisherOptions {
  readonly intervalMs: number;
}

export interface PublishTick {
  readonly published: boolean;
  /** Why nothing was published, when nothing was. */
  readonly reason?: 'no-ballots' | 'unchanged';
  readonly ballots: number;
}

/**
 * Keeps the spreadsheet's results snapshot current on its own.
 *
 * Votes have always mirrored themselves; the count did not, and the Dashboard
 * sat on "Not published yet" until somebody remembered a terminal command.
 *
 * **Only when the count has actually moved.** A snapshot is ~25 rows, and the
 * naive version — publish every tick — would append thousands of identical
 * rows over a polling day, bury the newest result under its own history, and
 * write a RESULTS_GENERATED audit entry every minute for a count nobody asked
 * for. The ballot total is the whole trigger: no new ballot, no new snapshot.
 *
 * This does not change what the spreadsheet is (ADR-5): still a downstream
 * mirror, still append-only, still reached through the same outbox as every
 * vote, so a Google outage delays it and never loses it.
 */
export class ResultsPublisher {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly repo: ElectionRepository,
    private readonly results: ResultsService,
    private readonly electionId: string,
    private readonly options: ResultsPublisherOptions,
  ) {}

  /**
   * The count already published, remembered in the database rather than in
   * this object.
   *
   * In memory it resets to "nothing published" on every boot, so a restart —
   * a deploy, a crash loop, a watch-mode reload — appends another copy of a
   * count that has not moved. -1, not 0, so the first ballot of the election
   * still publishes.
   */
  private get lastBallots(): number {
    return Number(getMeta(this.db, MARKER) ?? -1);
  }

  private set lastBallots(value: number) {
    setMeta(this.db, MARKER, String(value));
  }

  start(): void {
    if (this.timer) return;
    this.runOnce();
    this.timer = setInterval(() => this.runOnce(), this.options.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Re-arm after a reset.
   *
   * A reset drops the marker and every ballot, so the next tick would publish
   * nothing anyway — but the timer is mid-interval, and the first vote of the
   * real election should not wait up to a minute behind a countdown started
   * before the election existed.
   */
  restart(): void {
    if (!this.timer) return;
    this.stop();
    this.start();
  }

  runOnce(now: Date = new Date()): PublishTick {
    const ballots = this.repo.countBallots(this.electionId);

    // An all-zero snapshot is worse than none: the Dashboard would show ten
    // contests tied on nothing rather than saying it has not been published.
    if (ballots === 0) return { published: false, reason: 'no-ballots', ballots };
    if (ballots === this.lastBallots) return { published: false, reason: 'unchanged', ballots };

    this.results.publishToSpreadsheet(this.results.calculate(now), now);
    this.lastBallots = ballots;
    return { published: true, ballots };
  }
}
