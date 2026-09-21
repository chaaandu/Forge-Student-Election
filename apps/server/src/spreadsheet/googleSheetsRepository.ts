import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  BallotSelectionRow,
  CandidateRow,
  ResultRow,
  SpreadsheetHealth,
  SpreadsheetRepository,
  VoterParticipationRow,
} from './types.js';
import { SpreadsheetPermanentError, SpreadsheetTransientError } from './types.js';

export interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
}

export interface SheetsConfig {
  /** The id from the sheet URL: docs.google.com/spreadsheets/d/<THIS>/edit */
  readonly spreadsheetId: string;
  readonly tabs: {
    readonly voters: string;
    readonly candidates: string;
    readonly ballots: string;
    readonly results: string;
  };
  readonly serviceAccount: ServiceAccount;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Load a service account from the environment.
 *
 * Two forms, because deployments differ: the JSON inline in a variable (best
 * for a container — nothing on disk), or a path to the key file (easier
 * locally). The private key never leaves the server, and never appears in a log
 * or an error message.
 */
export function loadServiceAccount(inlineJson?: string, keyFile?: string): ServiceAccount {
  const raw = inlineJson?.trim()
    ? inlineJson
    : keyFile
      ? readFileSync(keyFile, 'utf8')
      : undefined;

  if (!raw) {
    throw new SpreadsheetPermanentError(
      'Google Sheets sync is enabled but no credentials were provided. Set ' +
        'GOOGLE_SERVICE_ACCOUNT_JSON (the whole key file as one value) or ' +
        'GOOGLE_SERVICE_ACCOUNT_KEY_FILE (a path to it).',
    );
  }

  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new SpreadsheetPermanentError(
      'The Google service account credentials are not valid JSON. Paste the key file exactly ' +
        'as downloaded, including the \\n escapes in private_key.',
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new SpreadsheetPermanentError(
      'The Google service account JSON is missing client_email or private_key.',
    );
  }

  return {
    client_email: parsed.client_email,
    // Environment variables flatten newlines; the PEM parser needs them back.
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Google Sheets, via a service account.
 *
 * A service account is used rather than an API key because **an API key can
 * only read public sheets — it cannot write**. The sheet is shared with the
 * service account's email address exactly as it would be shared with a person,
 * which also means access can be revoked from the sheet's own sharing dialog.
 *
 * Column order is read from each tab's header row at runtime and cached, so
 * whoever owns the sheet can reorder or rename columns without values silently
 * landing in the wrong place.
 */
export class GoogleSheetsRepository implements SpreadsheetRepository {
  readonly mode = 'sheets' as const;

  private token?: { value: string; expiresAt: number };
  private headerCache = new Map<string, string[]>();

  constructor(
    private readonly config: SheetsConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  /** Mint an access token by signing a JWT assertion with the service account key. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.config.serviceAccount.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );

    let signature: string;
    try {
      const signer = createSign('RSA-SHA256');
      signer.update(`${header}.${claims}`);
      signature = signer.sign(this.config.serviceAccount.private_key, 'base64url');
    } catch {
      throw new SpreadsheetPermanentError(
        'Could not sign with the Google service account private key. Check that private_key ' +
          'was copied whole, including the BEGIN/END lines.',
      );
    }

    const response = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });

    if (response.status === 429 || response.status >= 500) {
      throw new SpreadsheetTransientError(
        `Google token endpoint returned ${response.status}`,
        retryAfter(response),
      );
    }
    if (!response.ok) {
      // The response body echoes the assertion; it is never surfaced or logged.
      throw new SpreadsheetPermanentError(
        `Google refused the service account credentials (${response.status}). Check the key is ` +
          `current and that the Google Sheets API is enabled for its project.`,
      );
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
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
        `Network error talking to Google Sheets: ${(error as Error).message}`,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      throw new SpreadsheetTransientError(
        `Google Sheets returned ${response.status}`,
        retryAfter(response),
      );
    }
    if (response.status === 401) {
      this.token = undefined; // expired or revoked; one refresh is worth trying
      throw new SpreadsheetTransientError('Google Sheets returned 401 — refreshing the token');
    }
    if (response.status === 403) {
      throw new SpreadsheetPermanentError(
        `Google Sheets returned 403. Share the spreadsheet with ` +
          `${this.config.serviceAccount.client_email} and give it Editor access.`,
      );
    }
    if (response.status === 404) {
      throw new SpreadsheetPermanentError(
        `Google Sheets returned 404 for spreadsheet ${this.config.spreadsheetId}. Check ` +
          `SHEETS_SPREADSHEET_ID and that the named tab exists.`,
      );
    }
    if (!response.ok) {
      throw new SpreadsheetPermanentError(`Google Sheets returned ${response.status}.`);
    }
    return response;
  }

  /** Read a tab's header row so values are positioned by name, not by guess. */
  private async headers(tab: string): Promise<string[]> {
    const cached = this.headerCache.get(tab);
    if (cached) return cached;

    const range = encodeURIComponent(`${tab}!1:1`);
    const response = await this.call(
      `${SHEETS}/${this.config.spreadsheetId}/values/${range}`,
    );
    const body = (await response.json()) as { values?: string[][] };
    const headers = body.values?.[0];

    if (!headers || headers.length === 0) {
      throw new SpreadsheetPermanentError(
        `Tab "${tab}" has no header row. Put the column names in row 1.`,
      );
    }

    const normalised = headers.map((h) => String(h).trim().toLowerCase());
    this.headerCache.set(tab, normalised);
    return normalised;
  }

  private async append(tab: string, records: readonly Record<string, unknown>[]): Promise<void> {
    if (records.length === 0) return;
    const headers = await this.headers(tab);

    const values = records.map((record) => {
      const lookup = new Map(Object.entries(record).map(([k, v]) => [k.trim().toLowerCase(), v]));
      return headers.map((header) => {
        const value = lookup.get(header);
        if (value === undefined || value === null) return '';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        return value as string | number;
      });
    });

    const range = encodeURIComponent(`${tab}!A:A`);
    await this.call(
      `${SHEETS}/${this.config.spreadsheetId}/values/${range}:append` +
        `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values }) },
    );
  }

  async appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void> {
    await this.append(
      this.config.tabs.voters,
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
    await this.append(
      this.config.tabs.ballots,
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
    await this.append(
      this.config.tabs.candidates,
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
   * Results are appended as a timestamped snapshot, never overwritten.
   *
   * An election results sheet is exactly the wrong place to discover that a
   * clear-and-rewrite went further than intended. The newest `generated_at` is
   * the current result; earlier snapshots stay auditable.
   */
  async appendResults(rows: readonly ResultRow[]): Promise<void> {
    await this.append(
      this.config.tabs.results,
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
      await this.headers(this.config.tabs.ballots);
      return {
        ok: true,
        mode: 'sheets',
        detail: `Spreadsheet reachable; writing as ${this.config.serviceAccount.client_email}.`,
      };
    } catch (error) {
      return { ok: false, mode: 'sheets', detail: (error as Error).message };
    }
  }
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers?.get?.('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}
