import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hashPassword,
  issueSessionToken,
  verifyPassword,
  verifySessionToken,
} from '../services/adminAuth.js';
import { createHarness, startServer, TEST_ADMIN_TOKEN, type TestHarness, type TestServer } from './helpers.js';

const EMAIL = 'desk@seed.invalid';
const PASSWORD = 'a-long-enough-desk-passphrase';

let harness: TestHarness;
let server: TestServer;

const signIn = (email: string, password: string) =>
  fetch(`${server.url}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

beforeEach(async () => {
  harness = createHarness({
    envOverrides: {
      MONITOR_EMAIL: EMAIL,
      MONITOR_PASSWORD_HASH: hashPassword(PASSWORD),
    },
  });
  server = await startServer(harness);
});

afterEach(async () => {
  await server.close();
  harness.dispose();
});

describe('the stored password', () => {
  it('is a salted hash, never the password', () => {
    const stored = hashPassword(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword(PASSWORD, stored)).toBe(true);
    expect(verifyPassword(`${PASSWORD}!`, stored)).toBe(false);
  });

  it('salts per call, so two installs with the same password do not match', () => {
    expect(hashPassword(PASSWORD)).not.toBe(hashPassword(PASSWORD));
  });

  it('rejects a malformed stored hash rather than throwing', () => {
    for (const broken of ['', 'nonsense', 'scrypt$onlysalt', 'bcrypt$a$b']) {
      expect(verifyPassword(PASSWORD, broken)).toBe(false);
    }
  });
});

describe('the session token', () => {
  it('is accepted until it expires, and not after', () => {
    const now = Date.now();
    const token = issueSessionToken('secret', 60_000, now);

    expect(verifySessionToken(token, 'secret', now + 59_000)).toBe(true);
    expect(verifySessionToken(token, 'secret', now + 61_000)).toBe(false);
  });

  it('cannot be extended or forged by its holder', () => {
    const now = Date.now();
    const token = issueSessionToken('secret', 60_000, now);
    const [version, expires, signature] = token.split('.');

    // Push the expiry out and keep the signature: the signature covers it.
    const extended = `${version}.${Number(expires) + 86_400_000}.${signature}`;
    expect(verifySessionToken(extended, 'secret', now)).toBe(false);

    // A different server secret does not accept it either.
    expect(verifySessionToken(token, 'other-secret', now)).toBe(false);
    expect(verifySessionToken('garbage', 'secret', now)).toBe(false);
  });

  it('is not the admin token, so a desk left open is not holding the master key', () => {
    const token = issueSessionToken(TEST_ADMIN_TOKEN, 60_000);
    expect(token).not.toContain(TEST_ADMIN_TOKEN);
  });
});

describe('signing in to the desk', () => {
  it('exchanges the right details for a working credential', async () => {
    const response = await signIn(EMAIL, PASSWORD);
    expect(response.status).toBe(200);

    const { token } = (await response.json()) as { token: string };
    const monitor = await fetch(`${server.url}/api/admin/monitor`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(monitor.status).toBe(200);
  });

  it('is not case-sensitive about the address', async () => {
    expect((await signIn(EMAIL.toUpperCase(), PASSWORD)).status).toBe(200);
    expect((await signIn(`  ${EMAIL}  `, PASSWORD)).status).toBe(200);
  });

  it('refuses a wrong password, and says nothing about which half was wrong', async () => {
    const wrongPassword = await signIn(EMAIL, 'not-the-password');
    const wrongEmail = await signIn('someone@else.invalid', PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    // One message for both: the response must not be usable to test whether an
    // address exists.
    expect(await wrongPassword.text()).toBe(await wrongEmail.text());
  });

  it('does not put the attempted address in the audit log', async () => {
    await signIn('somebody@private.invalid', 'wrong');
    const entries = harness.ctx.audit.list(50, 'ADMIN_SIGN_IN');

    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain('somebody@private.invalid');
  });

  it('still accepts the admin token, which is what a script uses', async () => {
    const monitor = await fetch(`${server.url}/api/admin/monitor`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    expect(monitor.status).toBe(200);
  });

  it('advertises which credential the desk should ask for', async () => {
    const health = await (await fetch(`${server.url}/api/health`)).json();
    expect(health.adminSignIn).toBe('password');
  });
});

describe('with no desk account configured', () => {
  let plain: TestHarness;
  let plainServer: TestServer;

  beforeEach(async () => {
    plain = createHarness();
    plainServer = await startServer(plain);
  });

  afterEach(async () => {
    await plainServer.close();
    plain.dispose();
  });

  it('accepts nothing at the sign-in endpoint', async () => {
    const response = await fetch(`${plainServer.url}/api/admin/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    expect(response.status).toBe(401);
  });

  it('falls back to asking for the admin token', async () => {
    const health = await (await fetch(`${plainServer.url}/api/health`)).json();
    expect(health.adminSignIn).toBe('token');
  });
});
