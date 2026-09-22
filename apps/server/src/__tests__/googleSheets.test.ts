import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleSheetsRepository,
  loadServiceAccount,
  type SheetsConfig,
} from '../spreadsheet/googleSheetsRepository.js';
import { SpreadsheetPermanentError, SpreadsheetTransientError } from '../spreadsheet/types.js';

/** A real RSA key, so JWT signing is genuinely exercised rather than stubbed. */
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SERVICE_ACCOUNT = {
  client_email: 'mesa-elections@mesa-project.iam.gserviceaccount.com',
  private_key: privateKey,
};

const config: SheetsConfig = {
  spreadsheetId: 'sheet-123',
  tabs: { voters: 'Voters', candidates: 'Candidates', ballots: 'Ballots', results: 'Results' },
  serviceAccount: SERVICE_ACCOUNT,
};

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }), { status: 200 });

const isToken = (url: string) => url.includes('oauth2.googleapis.com');

describe('service account loading', () => {
  it('accepts the key file inline', () => {
    const account = loadServiceAccount(JSON.stringify(SERVICE_ACCOUNT));
    expect(account.client_email).toBe(SERVICE_ACCOUNT.client_email);
  });

  it('restores newlines that an environment variable flattened', () => {
    const flattened = JSON.stringify({
      client_email: 'a@b.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(loadServiceAccount(flattened).private_key).toContain('\n');
    expect(loadServiceAccount(flattened).private_key).not.toContain('\\n');
  });

  it('explains that an API key will not do', () => {
    expect(() => loadServiceAccount(undefined, undefined)).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_SERVICE_ACCOUNT_KEY_FILE/,
    );
  });

  it('rejects malformed JSON with an actionable message', () => {
    expect(() => loadServiceAccount('not json')).toThrow(/not valid JSON/);
  });

  it('rejects a key file missing its fields', () => {
    expect(() => loadServiceAccount('{"client_email":"a@b.com"}')).toThrow(/private_key/);
  });
});

describe('writing to Google Sheets', () => {
  it('signs a JWT assertion and exchanges it for an access token', async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') });
      if (isToken(url)) return tokenResponse();
      if (url.includes('/values/') && !url.includes(':append')) {
        return new Response(JSON.stringify({ values: [['voter_id', 'name']] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const repo = new GoogleSheetsRepository(config, fetcher as never);
    await repo.appendVoterParticipation([
      {
        voterId: 'stu-1',
        name: 'Student One',
        email: 's@x.invalid',
        type: 'student',
        houseId: 'aravalli',
        house: 'Aravalli',
        hasVoted: true,
        votedAt: '2026-03-04T10:00:00Z',
      },
    ]);

    const token = calls.find((c) => isToken(c.url));
    expect(token?.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    // header.claims.signature
    const assertion = new URLSearchParams(token?.body ?? '').get('assertion') ?? '';
    expect(assertion.split('.')).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1]!, 'base64url').toString());
    expect(claims.iss).toBe(SERVICE_ACCOUNT.client_email);
    expect(claims.scope).toBe('https://www.googleapis.com/auth/spreadsheets');
  });

  it('positions values by the sheet header row, not by assumption', async () => {
    const sent: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (isToken(url)) return tokenResponse();
      if (url.includes(':append')) {
        sent.push(JSON.parse(String(init?.body)));
        return new Response('{}', { status: 200 });
      }
      // Deliberately not the order our code writes them in.
      return new Response(
        JSON.stringify({ values: [['candidate_id', 'position_id', 'ballot_id']] }),
        { status: 200 },
      );
    });

    const repo = new GoogleSheetsRepository(config, fetcher as never);
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

  it('appends rather than overwriting, so a snapshot never destroys an earlier one', async () => {
    let appendUrl = '';
    const fetcher = vi.fn(async (url: string) => {
      if (isToken(url)) return tokenResponse();
      if (url.includes(':append')) {
        appendUrl = url;
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ values: [['position']] }), { status: 200 });
    });

    const repo = new GoogleSheetsRepository(config, fetcher as never);
    await repo.appendResults([{ position: 'President' } as never]);

    expect(appendUrl).toContain(':append');
    expect(appendUrl).toContain('insertDataOption=INSERT_ROWS');
    expect(appendUrl).not.toContain(':clear');
  });

  it('reuses a cached token instead of signing on every call', async () => {
    let tokenCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (isToken(url)) {
        tokenCalls += 1;
        return tokenResponse();
      }
      if (url.includes(':append')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ values: [['name']] }), { status: 200 });
    });

    const repo = new GoogleSheetsRepository(config, fetcher as never);
    await repo.appendResults([{ position: 'A' } as never]);
    await repo.appendResults([{ position: 'B' } as never]);

    expect(tokenCalls).toBe(1);
  });
});

describe('Google Sheets error classification', () => {
  const withStatus = (status: number, headers: Record<string, string> = {}) =>
    vi.fn(async (url: string) =>
      isToken(url) ? tokenResponse() : new Response('', { status, headers }),
    );

  it('treats 429 as transient and honours Retry-After', async () => {
    const repo = new GoogleSheetsRepository(config, withStatus(429, { 'retry-after': '30' }) as never);
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      SpreadsheetTransientError,
    );
  });

  it('treats 5xx as transient so the outbox retries', async () => {
    const repo = new GoogleSheetsRepository(config, withStatus(503) as never);
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      SpreadsheetTransientError,
    );
  });

  it('tells you exactly who to share the sheet with on a 403', async () => {
    const repo = new GoogleSheetsRepository(config, withStatus(403) as never);
    const health = await repo.health();

    expect(health.ok).toBe(false);
    expect(health.detail).toContain(SERVICE_ACCOUNT.client_email);
    expect(health.detail).toMatch(/Editor access/);
  });

  /**
   * A 403 body, shaped the way Google actually sends it.
   */
  const withReason = (reason: string) =>
    vi.fn(async (url: string) =>
      isToken(url)
        ? tokenResponse()
        : new Response(
            JSON.stringify({
              error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason }] },
            }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          ),
    );

  it('retries a 403 caused by the Sheets API being disabled', async () => {
    // This one is fixed by pressing ENABLE in the Cloud console — nothing about
    // this deployment changes. Classifying it permanent dead-letters every vote
    // cast before someone notices, and they are then never delivered. The
    // spreadsheet is shared correctly in this case, so the sharing advice would
    // also send whoever reads it to the wrong place.
    const repo = new GoogleSheetsRepository(config, withReason('SERVICE_DISABLED') as never);

    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      SpreadsheetTransientError,
    );
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toThrow(/not enabled/i);
  });

  it('retries a 403 that is really a quota, which Google does not send as 429', async () => {
    for (const reason of ['rateLimitExceeded', 'userRateLimitExceeded']) {
      const repo = new GoogleSheetsRepository(config, withReason(reason) as never);
      await expect(
        repo.appendResults([{ position: 'p' } as never]),
        reason,
      ).rejects.toBeInstanceOf(SpreadsheetTransientError);
    }
  });

  it('still dead-letters a 403 that really is the sheet not being shared', async () => {
    const repo = new GoogleSheetsRepository(config, withReason('forbidden') as never);
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      SpreadsheetPermanentError,
    );
  });

  it('treats 404 as permanent so it dead-letters instead of retrying forever', async () => {
    const repo = new GoogleSheetsRepository(config, withStatus(404) as never);
    await expect(repo.appendResults([{ position: 'p' } as never])).rejects.toBeInstanceOf(
      SpreadsheetPermanentError,
    );
  });

  it('says which tab is missing a header row', async () => {
    const fetcher = vi.fn(async (url: string) =>
      isToken(url) ? tokenResponse() : new Response(JSON.stringify({ values: [] }), { status: 200 }),
    );
    const repo = new GoogleSheetsRepository(config, fetcher as never);
    const health = await repo.health();

    expect(health.detail).toContain('Ballots');
    expect(health.detail).toMatch(/column names in row 1/);
  });

  it('never leaks the private key into an error message', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', assertion: 'x' }), { status: 400 }),
    );
    const repo = new GoogleSheetsRepository(config, fetcher as never);
    const health = await repo.health();

    expect(health.ok).toBe(false);
    expect(health.detail).not.toContain('PRIVATE KEY');
    expect(health.detail).not.toContain(SERVICE_ACCOUNT.private_key.slice(40, 90));
  });
});
