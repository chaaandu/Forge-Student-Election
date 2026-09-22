import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
/** Token version, so a future format change is distinguishable rather than ambiguous. */
const TOKEN_VERSION = 'm1';

/**
 * Sign-in for the election desk.
 *
 * The desk is run by a person, so it takes an address and a password rather
 * than a shared API token pasted from a chat message. Three properties matter:
 *
 *   • The password is never stored. Only a scrypt hash with a per-install salt
 *     goes in the environment, so a leaked `.env` does not hand anybody the
 *     password — and this file cannot tell you what it is either.
 *
 *   • Signing in does NOT hand the browser `ADMIN_API_TOKEN`. That token is the
 *     long-lived master credential, also used by the publish and reset scripts;
 *     putting it in `sessionStorage` on a machine in a hall would make every
 *     desk a copy of it. Instead the server mints a session token that expires.
 *
 *   • The session token carries its own expiry and a signature over it, so it
 *     needs no server-side table and cannot be extended by its holder.
 */

/** `scrypt$<salt>$<hash>` — the form `MONITOR_PASSWORD_HASH` takes. */
export function hashPassword(password: string, salt = randomBytes(SALT_BYTES).toString('hex')): string {
  const key = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${SCHEME}$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== SCHEME || !salt || !expected) return false;

  const actual = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  // Equal lengths by construction, but timingSafeEqual throws rather than
  // returning false when they differ, and a thrown error is a 500 not a 403.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function issueSessionToken(secret: string, ttlMs: number, now: number = Date.now()): string {
  const expiresAt = now + ttlMs;
  return `${TOKEN_VERSION}.${expiresAt}.${sign(secret, String(expiresAt))}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  const [version, expiresRaw, signature] = token.split('.');
  if (version !== TOKEN_VERSION || !expiresRaw || !signature) return false;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const expected = sign(secret, expiresRaw);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

export interface AdminSignIn {
  readonly email: string;
  readonly passwordHash: string;
}

/**
 * Check an address and password against the configured desk account.
 *
 * The address is compared case-insensitively — nobody types their own address
 * in the same case twice — and the password is always hashed even when the
 * address is wrong, so a wrong address and a wrong password take the same time
 * and the response cannot be used to enumerate one.
 */
export function checkSignIn(
  credentials: AdminSignIn | undefined,
  email: string,
  password: string,
): boolean {
  const configured = credentials ?? {
    email: '',
    // A well-formed hash of something unguessable, so the miss path does the
    // same work as the hit path.
    passwordHash: hashPassword(randomBytes(32).toString('hex')),
  };

  const addressMatches = email.trim().toLowerCase() === configured.email.trim().toLowerCase();
  const passwordMatches = verifyPassword(password, configured.passwordHash);
  return Boolean(credentials) && addressMatches && passwordMatches;
}
