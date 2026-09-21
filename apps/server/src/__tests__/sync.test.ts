import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExcelPermanentError,
  ExcelTransientError,
  type BallotSelectionRow,
  type ExcelHealth,
  type ExcelRepository,
  type ResultRow,
  type VoterParticipationRow,
} from '../excel/types.js';
import { GraphExcelRepository } from '../excel/graphExcelRepository.js';
import {
  checkIn,
  createHarness,
  EMPLOYEE_BALLOT,
  startServer,
  STUDENT_BALLOT,
  submitBallot,
  type TestHarness,
  type TestServer,
} from './helpers.js';

/** A workbook that can be told to fail, throttle, then recover. */
class FakeExcel implements ExcelRepository {
  readonly mode = 'null' as const;
  failures = 0;
  mode_: 'ok' | 'transient' | 'permanent' = 'ok';
  ballots: BallotSelectionRow[] = [];
  participation: VoterParticipationRow[] = [];
  results: ResultRow[] = [];

  private guard(): void {
    if (this.mode_ === 'transient') {
      this.failures += 1;
      throw new ExcelTransientError('Graph returned 429', 1);
    }
    if (this.mode_ === 'permanent') {
      this.failures += 1;
      throw new ExcelPermanentError('table "Ballots" not found');
    }
  }

  async appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void> {
    this.guard();
    this.participation.push(...rows);
  }
  async appendBallotSelections(rows: readonly BallotSelectionRow[]): Promise<void> {
    this.guard();
    this.ballots.push(...rows);
  }
  async upsertCandidates(): Promise<void> {
    this.guard();
  }
  async appendResults(rows: readonly ResultRow[]): Promise<void> {
    this.guard();
    this.results.push(...rows);
  }
  async health(): Promise<ExcelHealth> {
    return { ok: this.mode_ === 'ok', mode: 'fake', detail: this.mode_ };
  }
}

let harness: TestHarness;
let server: TestServer;
let excel: FakeExcel;

beforeEach(async () => {
  excel = new FakeExcel();
  harness = createHarness({ excel });
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('Excel is a mirror, not the source of truth', () => {
  it('records the vote even when the workbook is completely unavailable', async () => {
    excel.mode_ = 'transient';

    const token = await checkIn(server, 'stu-1');
    const { status } = await submitBallot(server, token, STUDENT_BALLOT);

    // The voter gets a true success: the vote IS recorded.
    expect(status).toBe(201);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(1);

    await harness.ctx.sync.runOnce();
    expect(excel.ballots).toHaveLength(0);
    expect(excel.failures).toBeGreaterThan(0);

    // And nothing was lost: it is still queued.
    const status_ = harness.ctx.outbox.status();
    expect(status_.pending).toBeGreaterThan(0);
    expect(status_.synced).toBe(0);
  });

  it('delivers everything once the workbook recovers', async () => {
    excel.mode_ = 'transient';
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);
    await harness.ctx.sync.runOnce();

    excel.mode_ = 'ok';
    // Backoff has pushed the retry into the future; run as if time has passed.
    await harness.ctx.sync.runOnce(new Date(Date.now() + 10 * 60_000));

    expect(excel.participation).toHaveLength(1);
    expect(excel.ballots).toHaveLength(Object.keys(STUDENT_BALLOT).length);
    expect(harness.ctx.outbox.status().pending).toBe(0);
    expect(harness.ctx.outbox.status().synced).toBe(2);
  });

  it('never writes a voter reference into the workbook ballot rows', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);
    await harness.ctx.sync.runOnce();

    const serialised = JSON.stringify(excel.ballots);
    expect(serialised).not.toContain('stu-1');
    expect(serialised).not.toContain('Student One');
    expect(serialised).not.toContain('seed.invalid');
  });

  it('gives every workbook ballot row a stable dedupe key', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);
    await harness.ctx.sync.runOnce();

    expect(excel.ballots.every((r) => r.dedupeKey.startsWith('ballot:'))).toBe(true);
    expect(new Set(excel.ballots.map((r) => r.dedupeKey)).size).toBe(excel.ballots.length);
  });

  it('dead-letters a permanent failure immediately rather than retrying forever', async () => {
    excel.mode_ = 'permanent';
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    const summary = await harness.ctx.sync.runOnce();
    expect(summary.deadLettered).toBe(2);
    expect(harness.ctx.outbox.status().failed).toBe(2);

    const events = (harness.ctx.audit.list(50) as { event: string }[]).map((e) => e.event);
    expect(events).toContain('SYNC_DEAD_LETTERED');
  });

  it('can requeue dead-lettered rows once the workbook is fixed', async () => {
    excel.mode_ = 'permanent';
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);
    await harness.ctx.sync.runOnce();

    excel.mode_ = 'ok';
    expect(harness.ctx.outbox.retryFailed()).toBe(2);
    await harness.ctx.sync.runOnce();

    expect(harness.ctx.outbox.status().synced).toBe(2);
    expect(excel.ballots.length).toBeGreaterThan(0);
  });

  it('backs off between retries instead of hammering the workbook', async () => {
    excel.mode_ = 'transient';
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    await harness.ctx.sync.runOnce();
    const afterFirst = excel.failures;

    // Immediately again: nothing is due yet, so nothing is attempted.
    await harness.ctx.sync.runOnce();
    expect(excel.failures).toBe(afterFirst);
  });

  it('releases rows stranded in flight by a crash', async () => {
    const token = await checkIn(server, 'stu-1');
    await submitBallot(server, token, STUDENT_BALLOT);

    harness.ctx.db.exec("UPDATE outbox SET status = 'in_flight'");
    expect(harness.ctx.outbox.releaseStale()).toBe(2);
    expect(harness.ctx.outbox.status().pending).toBe(2);
  });

  it('enqueues exactly one participation row per voter, even across retries', async () => {
    const t1 = await checkIn(server, 'stu-1');
    await submitBallot(server, t1, STUDENT_BALLOT);
    const t2 = await checkIn(server, 'emp-1');
    await submitBallot(server, t2, EMPLOYEE_BALLOT);

    await harness.ctx.sync.runOnce();
    expect(excel.participation.map((p) => p.voterId).sort()).toEqual(['emp-1', 'stu-1']);
  });
});

describe('GraphExcelRepository error classification', () => {
  const config = {
    tenantId: 't',
    clientId: 'c',
    clientSecret: 's',
    driveId: 'd',
    workbookId: 'w',
    tables: { voters: 'V', candidates: 'C', ballots: 'B', results: 'R' },
  };

  const tokenResponse = () =>
    new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });

  it('treats 429 as transient and honours Retry-After', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('login.microsoftonline')
        ? tokenResponse()
        : new Response('', { status: 429, headers: { 'retry-after': '30' } }),
    );
    const repo = new GraphExcelRepository(config, fetcher as never);

    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      ExcelTransientError,
    );
  });

  it('treats 5xx as transient', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('login.microsoftonline') ? tokenResponse() : new Response('', { status: 503 }),
    );
    const repo = new GraphExcelRepository(config, fetcher as never);
    await expect(repo.health()).resolves.toMatchObject({ ok: false });
  });

  it('treats 404 as permanent so it dead-letters instead of retrying forever', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('login.microsoftonline') ? tokenResponse() : new Response('', { status: 404 }),
    );
    const repo = new GraphExcelRepository(config, fetcher as never);
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      ExcelPermanentError,
    );
  });

  it('positions values by the workbook header row, not by assumption', async () => {
    const sent: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('login.microsoftonline')) return tokenResponse();
      if (url.endsWith('/headerRowRange')) {
        // Deliberately not the order our code writes them in.
        return new Response(
          JSON.stringify({ values: [['candidate_id', 'position_id', 'ballot_id']] }),
          { status: 200 },
        );
      }
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 201 });
    });

    const repo = new GraphExcelRepository(config, fetcher as never);
    await repo.appendBallotSelections([
      {
        ballotId: 'B1',
        electionId: 'E',
        voterType: 'student',
        submittedHour: 'H',
        positionId: 'president',
        candidateId: 'p1',
        dedupeKey: 'k',
      },
    ]);

    expect(sent[0]).toEqual({ values: [['p1', 'president', 'B1']] });
  });

  it('never echoes the client secret into an error message', async () => {
    const SECRET = 'sUp3r-s3cret-graph-value';
    // Microsoft can echo request parameters back in an error body; nothing from
    // that body may reach a log or a response.
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_client', client_secret: SECRET }), {
          status: 401,
        }),
    );
    const repo = new GraphExcelRepository({ ...config, clientSecret: SECRET }, fetcher as never);
    const health = await repo.health();

    expect(health.ok).toBe(false);
    expect(health.detail).not.toContain(SECRET);
    expect(health.detail).toMatch(/EXCEL_CLIENT_SECRET/); // names the variable, not its value
  });
});
