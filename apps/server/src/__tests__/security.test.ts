import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIn,
  createHarness,
  EMPLOYEE_BALLOT,
  startServer,
  STUDENT_BALLOT,
  submitBallot,
  TEST_ADMIN_TOKEN,
  TEST_KIOSK_TOKEN,
  type TestHarness,
  type TestServer,
} from './helpers.js';
import { InsecureIdentityProviderError, createIdentityProvider } from '../identity/index.js';
import { EnvironmentError, loadEnv } from '../config/env.js';
import { maskEmail } from '../http/middleware.js';

let harness: TestHarness;
let server: TestServer;

beforeEach(async () => {
  harness = createHarness();
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('the request body cannot influence identity', () => {
  it('ignores a forged voterType and still applies the real one', async () => {
    const token = await checkIn(server, 'emp-1');

    // An employee claiming to be a student, and sending a student ballot.
    const response = await fetch(`${server.url}/api/ballots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        voterId: 'stu-1',
        voterType: 'student',
        selections: STUDENT_BALLOT,
      }),
    });

    // Rejected because the SERVER's record says employee, so the house captain
    // selection is ineligible. The forged fields had no effect whatsoever.
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.details.issues.map((i: any) => i.code)).toContain('INELIGIBLE_POSITION');
    expect(harness.ctx.repo.findVoterById('stu-1')?.hasVoted).toBe(false);
    expect(harness.ctx.repo.findVoterById('emp-1')?.hasVoted).toBe(false);
  });

  it('ignores a forged voterId and records the ballot against the session voter', async () => {
    const token = await checkIn(server, 'emp-1');

    await fetch(`${server.url}/api/ballots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({ voterId: 'emp-2', selections: EMPLOYEE_BALLOT }),
    });

    expect(harness.ctx.repo.findVoterById('emp-1')?.hasVoted).toBe(true);
    expect(harness.ctx.repo.findVoterById('emp-2')?.hasVoted).toBe(false);
  });

  it('stores the voter type from the database on the anonymous ballot', async () => {
    const token = await checkIn(server, 'emp-1');
    await submitBallot(server, token, EMPLOYEE_BALLOT);

    const row = harness.ctx.db.prepare('SELECT voter_type FROM ballots').get() as {
      voter_type: string;
    };
    expect(row.voter_type).toBe('employee');
  });
});

describe('sessions', () => {
  it('refuses a ballot with no session', async () => {
    const response = await fetch(`${server.url}/api/ballots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ selections: EMPLOYEE_BALLOT }),
    });
    expect(response.status).toBe(401);
  });

  it('refuses a fabricated bearer token', async () => {
    const result = await submitBallot(server, 'not-a-real-token', EMPLOYEE_BALLOT);
    expect(result.status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const token = await checkIn(server, 'emp-1');
    const rows = harness.ctx.db.prepare('SELECT token_hash FROM sessions').all() as {
      token_hash: string;
    }[];
    expect(rows.every((r) => r.token_hash !== token)).toBe(true);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('revokes a session presented from a different device', async () => {
    const token = await checkIn(server, 'emp-1');
    const resolved = harness.ctx.sessions.resolve(token, {
      ip: '10.9.9.9',
      userAgent: 'someone-elses-browser',
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toBe('BINDING_MISMATCH');

    // And it stays dead even from the original device.
    expect(harness.ctx.sessions.resolve(token).ok).toBe(false);
  });

  it('expires a session after its TTL', async () => {
    const issued = harness.ctx.sessions.issue('emp-1');
    const later = new Date(Date.now() + 60 * 60_000);
    const resolved = harness.ctx.sessions.resolve(issued.token, {}, later);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toBe('EXPIRED');
  });
});

describe('the voter roll is not a directory', () => {
  it('requires the kiosk token to search', async () => {
    const response = await fetch(`${server.url}/api/auth/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Student' }),
    });
    expect(response.status).toBe(403);
  });

  it('masks emails in search results', async () => {
    const response = await fetch(`${server.url}/api/auth/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kiosk-token': TEST_KIOSK_TOKEN },
      body: JSON.stringify({ query: 'Student' }),
    });
    const body = await response.json();

    expect(body.results.length).toBeGreaterThan(0);
    for (const result of body.results) {
      expect(result).not.toHaveProperty('email');
      expect(result.maskedEmail).toContain('•');
      expect(result.maskedEmail).not.toBe('stu1@seed.invalid');
    }
  });

  it('refuses a single-character query', async () => {
    const response = await fetch(`${server.url}/api/auth/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kiosk-token': TEST_KIOSK_TOKEN },
      body: JSON.stringify({ query: 'S' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('masks an email without revealing the local part', () => {
    expect(maskEmail('chandu@mesa.edu')).toBe('ch••••@mesa.edu');
    expect(maskEmail('a@mesa.edu')).toBe('a•••@mesa.edu');
  });

  it('never ships the roll with the public election payload', async () => {
    const response = await fetch(`${server.url}/api/election`);
    const text = await response.text();
    expect(text).not.toContain('seed.invalid');
    expect(text).not.toContain('stu-1');
    // ...and no withdrawn candidate either.
    expect(text).not.toContain('Withdrawn President');
  });
});

describe('admin routes', () => {
  const paths = ['/api/admin/results', '/api/admin/turnout', '/api/admin/audit'];

  it('refuses admin routes with no token', async () => {
    for (const path of paths) {
      expect((await fetch(`${server.url}${path}`)).status).toBe(403);
    }
  });

  it('refuses admin routes with a voter session token', async () => {
    const token = await checkIn(server, 'emp-1');
    for (const path of paths) {
      const response = await fetch(`${server.url}${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(403);
    }
  });

  it('allows admin routes with the admin token and audits the access', async () => {
    const response = await fetch(`${server.url}/api/admin/turnout`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    expect(response.status).toBe(200);

    const events = (harness.ctx.audit.list(20) as { event: string }[]).map((e) => e.event);
    expect(events).toContain('ADMIN_ACCESS');
  });
});

describe('hostile payloads', () => {
  it('rejects a body over the size cap', async () => {
    const token = await checkIn(server, 'emp-1');
    const huge: Record<string, string> = {};
    for (let i = 0; i < 5000; i += 1) huge[`position-${i}`] = 'x'.repeat(40);

    const response = await fetch(`${server.url}/api/ballots`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({ selections: huge }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(harness.ctx.repo.countBallots('test-election')).toBe(0);
  });

  it('requires an idempotency key', async () => {
    const token = await checkIn(server, 'emp-1');
    const response = await fetch(`${server.url}/api/ballots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ selections: EMPLOYEE_BALLOT }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('never returns a stack trace or internal detail to the client', async () => {
    const response = await fetch(`${server.url}/api/nope`);
    const body = await response.text();
    expect(body).not.toMatch(/at \/|node_modules|\.ts:/);
  });
});

describe('production guards', () => {
  const base = {
    NODE_ENV: 'production',
    AUTH_MODE: 'access-code',
    ADMIN_API_TOKEN: 'a'.repeat(40),
    KIOSK_TOKEN: 'k'.repeat(40),
    HASH_SALT: 's'.repeat(40),
    ACCESS_CODE_PEPPER: 'p'.repeat(40),
  } as NodeJS.ProcessEnv;

  it('refuses to start in production with AUTH_MODE=dev', () => {
    expect(() => loadEnv({ ...base, AUTH_MODE: 'dev' })).toThrow(EnvironmentError);
    expect(() => loadEnv({ ...base, AUTH_MODE: 'dev' })).toThrow(/no identity verification/);
  });

  it('refuses a placeholder secret', () => {
    expect(() =>
      loadEnv({ ...base, ADMIN_API_TOKEN: 'replace-me-admin-api-token-min-32-chars' }),
    ).toThrow(/placeholder/);
  });

  it('refuses a short secret', () => {
    expect(() => loadEnv({ ...base, HASH_SALT: 'short' })).toThrow(/at least 32 characters/);
  });

  it('refuses entra mode with missing credentials', () => {
    expect(() => loadEnv({ ...base, AUTH_MODE: 'entra' })).toThrow(/MICROSOFT_TENANT_ID/);
  });

  it('accepts a correctly configured production environment', () => {
    expect(() => loadEnv(base)).not.toThrow();
  });

  it('refuses to construct the dev identity provider in production', () => {
    const env = loadEnv(base);
    expect(() =>
      createIdentityProvider(
        { ...env, AUTH_MODE: 'dev' },
        harness.ctx.db,
        harness.ctx.repo,
        'test-election',
      ),
    ).toThrow(InsecureIdentityProviderError);
  });
});
