import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccessCodeProvider, MAX_CODE_ATTEMPTS } from '../identity/index.js';
import { generateAccessCode, hashAccessCode, normaliseAccessCode } from '../lib/crypto.js';
import { createHarness, type TestHarness } from './helpers.js';

let harness: TestHarness;
let provider: AccessCodeProvider;
const PEPPER = 'test-pepper-0123456789abcdef0123';
const CODE = 'K7M2PQ';

beforeEach(() => {
  harness = createHarness();
  const salt = randomBytes(16).toString('hex');
  harness.ctx.db
    .prepare('UPDATE voters SET access_code_hash = ?, access_code_salt = ? WHERE id = ?')
    .run(hashAccessCode(CODE, salt, PEPPER), salt, 'stu-1');
  provider = new AccessCodeProvider(harness.ctx.repo, PEPPER);
});

afterEach(() => {
  harness.dispose();
});

describe('access codes', () => {
  it('accepts the correct code', () => {
    const outcome = provider.verify('stu-1', CODE);
    expect(outcome.ok).toBe(true);
  });

  it('accepts the code with friendly formatting', () => {
    expect(provider.verify('stu-1', ' k7m2 pq ').ok).toBe(true);
    expect(provider.verify('stu-1', 'k7m2-pq').ok).toBe(true);
  });

  it('rejects a wrong code and counts down the attempts', () => {
    const outcome = provider.verify('stu-1', 'WRONG1');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('INVALID_CODE');
      expect(outcome.attemptsRemaining).toBe(MAX_CODE_ATTEMPTS - 1);
    }
  });

  it('locks out after repeated failures', () => {
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i += 1) provider.verify('stu-1', 'WRONG1');
    const outcome = provider.verify('stu-1', 'WRONG1');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('LOCKED_OUT');
      expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    }
    // The correct code is refused while locked: a brute-forcer cannot simply
    // keep going after tripping the limit.
    expect(provider.verify('stu-1', CODE).ok).toBe(false);
  });

  it('clears the attempt counter on success', () => {
    provider.verify('stu-1', 'WRONG1');
    provider.verify('stu-1', CODE);
    expect(harness.ctx.repo.findVoterById('stu-1')?.failedAttempts).toBe(0);
  });

  it('gives the same answer for an unknown voter as for a wrong code', () => {
    const unknown = provider.verify('does-not-exist', CODE);
    const wrong = provider.verify('stu-1', 'WRONG1');

    expect(unknown.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    // Identical code and message: this endpoint cannot be used to discover who
    // is on the roll.
    if (!unknown.ok && !wrong.ok) {
      expect(unknown.code).toBe(wrong.code);
      expect(unknown.message).toBe(wrong.message);
    }
  });

  it('refuses a voter who has no code issued', () => {
    expect(provider.verify('stu-2', CODE).ok).toBe(false);
  });

  it('never stores the code in plaintext', () => {
    const row = harness.ctx.db
      .prepare('SELECT access_code_hash FROM voters WHERE id = ?')
      .get('stu-1') as { access_code_hash: string };
    expect(row.access_code_hash).not.toContain(CODE);
    expect(row.access_code_hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('produces a different hash for the same code under a different pepper', () => {
    const salt = 'fixed-salt';
    expect(hashAccessCode(CODE, salt, 'pepper-a')).not.toBe(hashAccessCode(CODE, salt, 'pepper-b'));
  });
});

describe('code generation', () => {
  it('uses only unambiguous characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateAccessCode(6)).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    }
  });

  it('is not obviously biased', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i += 1) {
      for (const ch of generateAccessCode(6)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // Rejection sampling, so no symbol should be wildly over-represented.
    expect(Math.max(...values)).toBeLessThan(mean * 1.4);
  });

  it('forgives the characters people confuse', () => {
    expect(normaliseAccessCode('io1l0')).toBe('10110');
  });
});
