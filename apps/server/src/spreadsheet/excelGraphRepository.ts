import type {
  BallotSelectionRow,
  CandidateRow,
  SpreadsheetHealth,
  SpreadsheetRepository,
  ResultRow,
  VoterParticipationRow,
} from './types.js';
import { SpreadsheetPermanentError, SpreadsheetTransientError } from './types.js';

export interface GraphConfig {
  readonly tenantId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly driveId: string;
  readonly workbookId: string;
  readonly tables: {
    readonly voters: string;
    readonly candidates: string;
    readonly ballots: string;
    readonly results: string;
  };
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * Microsoft Graph workbook mirror.
 *
 * Column order is discovered from each table's header row at runtime and
 * cached, so the workbook can be rearranged by whoever owns it without
 * silently writing values into the wrong columns.
 *
 * Credentials are read from the environment and never leave the server.
 */
export class ExcelGraphRepository implements SpreadsheetRepository {
  readonly mode = 'graph' as const;

  private token?: { value: string; expiresAt: number };
  private headerCache = new Map<string, string[]>();

  constructor(
    private readonly config: GraphConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    // 60s of slack so a token cannot expire between the check and the call.
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const response = await this.fetcher(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    );

    if (response.status === 429 || response.status >= 500) {
      throw new SpreadsheetTransientError(
        `Token endpoint returned ${response.status}`,
        retryAfter(response),
      );
    }
    if (!response.ok) {
      // The body can contain the client secret in an error echo; it is not logged.
      throw new SpreadsheetPermanentError(
        `Graph token request failed with ${response.status}. Check EXCEL_CLIENT_ID / ` +
          `EXCEL_CLIENT_SECRET / EXCEL_TENANT_ID and the app registration's permissions.`,
      );
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  private tableUrl(table: string, suffix = ''): string {
    return (
      `${GRAPH}/drives/${this.config.driveId}/items/${this.config.workbookId}` +
      `/workbook/tables/${encodeURIComponent(table)}${suffix}`
    );
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });
    } catch (error) {
      throw new SpreadsheetTransientError(
        `Network error talking to Microsoft Graph: ${(error as Error).message}`,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw new SpreadsheetTransientError(`Graph returned ${response.status}`, retryAfter(response));
    }
    if (response.status === 401 || response.status === 403) {
      this.token = undefined; // force a refresh; the next attempt may succeed
      throw new SpreadsheetTransientError(
        `Graph returned ${response.status} — token refreshed, will retry once`,
      );
    }
    if (!response.ok) {
      throw new SpreadsheetPermanentError(
        `Graph returned ${response.status} for ${new URL(url).pathname}. ` +
          `Check that the table exists and the app has write access to the workbook.`,
      );
    }
    return response;
  }

  /** Read the table's header row so values are positioned by name, not by guess. */
  private async headers(table: string): Promise<string[]> {
    const cached = this.headerCache.get(table);
    if (cached) return cached;

    const response = await this.call(this.tableUrl(table, '/headerRowRange'));
    const body = (await response.json()) as { values?: string[][] };
    const headers = body.values?.[0];
    if (!headers || headers.length === 0) {
      throw new SpreadsheetPermanentError(`Table "${table}" has no header row.`);
    }
    const normalised = headers.map((h) => String(h).trim().toLowerCase());
    this.headerCache.set(table, normalised);
    return normalised;
  }

  private async addRows(table: string, records: readonly Record<string, unknown>[]): Promise<void> {
    if (records.length === 0) return;
    const headers = await this.headers(table);

    const values = records.map((record) => {
      const lookup = new Map(
        Object.entries(record).map(([k, v]) => [k.trim().toLowerCase(), v]),
      );
      return headers.map((header) => {
        const value = lookup.get(header);
        if (value === undefined || value === null) return '';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        return value as string | number;
      });
    });

    await this.call(this.tableUrl(table, '/rows'), {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }

  async appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void> {
    await this.addRows(
      this.config.tables.voters,
      rows.map((r) => ({
        voter_id: r.voterId,
        name: r.name,
        email: r.email,
        type: r.type,
        house: r.houseId ?? '',
        has_voted: r.hasVoted,
        voted_at: r.votedAt,
      })),
    );
  }

  async appendBallotSelections(rows: readonly BallotSelectionRow[]): Promise<void> {
    await this.addRows(
      this.config.tables.ballots,
      rows.map((r) => ({
        ballot_id: r.ballotId,
        election_id: r.electionId,
        voter_type: r.voterType,
        submitted_hour: r.submittedHour,
        position_id: r.positionId,
        candidate_id: r.candidateId,
        dedupe_key: r.dedupeKey,
      })),
    );
  }

  async upsertCandidates(rows: readonly CandidateRow[]): Promise<void> {
    await this.addRows(
      this.config.tables.candidates,
      rows.map((r) => ({
        candidate_id: r.candidateId,
        name: r.name,
        position: r.position,
        house: r.house,
        photo_url: r.photoUrl,
        active: r.active,
      })),
    );
  }

  /**
   * Results are appended as a timestamped snapshot rather than overwriting.
   *
   * Deleting rows over Graph is both fiddly and destructive; an election result
   * sheet is exactly the wrong place to discover a delete went further than
   * intended. Each run stamps `generated_at`, so the latest snapshot is the one
   * with the newest timestamp and earlier ones remain auditable.
   */
  async appendResults(rows: readonly ResultRow[]): Promise<void> {
    await this.addRows(
      this.config.tables.results,
      rows.map((r) => ({
        position: r.position,
        weighting_applied: r.weightingApplied,
        candidate: r.candidate,
        student_votes: r.studentVotes,
        student_percentage: r.studentPct,
        student_contribution: r.studentContribution,
        employee_votes: r.employeeVotes,
        employee_percentage: r.employeePct,
        employee_contribution: r.employeeContribution,
        weighted_score: r.weightedScore,
        rank: r.rank,
        tied: r.tied,
        generated_at: r.generatedAt,
      })),
    );
  }

  async health(): Promise<SpreadsheetHealth> {
    try {
      await this.headers(this.config.tables.ballots);
      return { ok: true, mode: 'graph', detail: 'Workbook reachable and tables resolved.' };
    } catch (error) {
      return { ok: false, mode: 'graph', detail: (error as Error).message };
    }
  }
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers?.get?.('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}
