import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/** Crockford base32 minus ambiguous glyphs: no I, L, O, U. Safe to read aloud and to type. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SCRYPT_KEYLEN = 64;

export function newId(): string {
  return randomUUID();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Salted hash for values we must be able to correlate but never read: IPs, user agents. */
export function saltedHash(value: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${value}`, 'utf8').digest('hex');
}

/**
 * Generate a one-time access code.
 *
 * Rejection sampling rather than `% alphabet.length`, which would make the
 * first few symbols marginally more likely — a small bias, but not one worth
 * having in a credential.
 */
export function generateAccessCode(length = 6): string {
  let code = '';
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= 256 - (256 % CODE_ALPHABET.length)) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

export function normaliseAccessCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0');
}

export function hashAccessCode(
  code: string,
  salt: string,
  pepper: string,
): string {
  return scryptSync(`${normaliseAccessCode(code)}:${pepper}`, salt, SCRYPT_KEYLEN).toString('hex');
}

/** Constant-time comparison that does not leak length through an early return. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(sha256(a), 'hex');
  const bufB = Buffer.from(sha256(b), 'hex');
  return timingSafeEqual(bufA, bufB);
}

/**
 * Coarsen a timestamp to the hour.
 *
 * Ballot timestamps are deliberately imprecise: a per-second timestamp on an
 * anonymous ballot plus a per-second `voted_at` on the voter record would
 * re-link the two. See docs/security-model.md §6.
 */
export function hourBucket(date: Date): string {
  return `${date.toISOString().slice(0, 13)}:00Z`;
}
