import { describe, expect, it } from 'vitest';
import { validateBallot } from '../validation.js';
import type { BallotIssueCode } from '../validation.js';
import {
  completeEmployeeBallot,
  completeStudentBallot,
  employee,
  makeConfig,
  studentAravalli,
} from './fixtures.js';

const config = makeConfig();
const codes = (result: { issues: readonly { code: BallotIssueCode }[] }) =>
  result.issues.map((i) => i.code);

describe('validateBallot — happy path', () => {
  it('accepts a complete student ballot', () => {
    const result = validateBallot(config, studentAravalli, completeStudentBallot);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('accepts a complete employee ballot with no house selection', () => {
    const result = validateBallot(config, employee, completeEmployeeBallot);
    expect(result.valid).toBe(true);
  });
});

describe('validateBallot — completeness', () => {
  it('rejects a ballot missing a leadership position', () => {
    const result = validateBallot(config, studentAravalli, {
      president: 'p1',
      'house-captain-aravalli': 'a1',
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('MISSING_SELECTION');
    expect(result.missingPositionIds).toEqual(['vice-president']);
  });

  it('rejects a student ballot missing their house captain', () => {
    const result = validateBallot(config, studentAravalli, completeEmployeeBallot);
    expect(result.valid).toBe(false);
    expect(result.missingPositionIds).toEqual(['house-captain-aravalli']);
  });

  it('rejects an empty ballot and names every gate', () => {
    const result = validateBallot(config, studentAravalli, {});
    expect(result.valid).toBe(false);
    expect(result.missingPositionIds).toHaveLength(3);
  });
});

describe('validateBallot — extra selections are fatal, never trimmed', () => {
  it('rejects the whole ballot when an employee sends a house captain selection', () => {
    const result = validateBallot(config, employee, {
      ...completeEmployeeBallot,
      'house-captain-aravalli': 'a1',
    });

    expect(result.valid).toBe(false);
    expect(codes(result)).toEqual(['INELIGIBLE_POSITION']);
    // Crucially: the valid part is NOT reported as acceptable. The caller gets
    // `valid: false` and must reject the submission outright.
    expect(result.missingPositionIds).toHaveLength(0);
  });

  it("rejects a student voting in another house's contest", () => {
    const result = validateBallot(config, studentAravalli, {
      ...completeStudentBallot,
      'house-captain-nilgiri': 'n1',
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('INELIGIBLE_POSITION');
  });

  it('rejects a position that is not in the election at all', () => {
    const result = validateBallot(config, employee, {
      ...completeEmployeeBallot,
      'treasurer': 'x1',
    });
    expect(codes(result)).toContain('UNKNOWN_POSITION');
  });
});

describe('validateBallot — candidate integrity', () => {
  it('rejects an unknown candidate id', () => {
    const result = validateBallot(config, employee, {
      ...completeEmployeeBallot,
      president: 'does-not-exist',
    });
    expect(codes(result)).toContain('UNKNOWN_CANDIDATE');
  });

  it('rejects a candidate standing for a different position', () => {
    const result = validateBallot(config, employee, {
      president: 'v1',
      'vice-president': 'v2',
    });
    expect(codes(result)).toContain('CANDIDATE_POSITION_MISMATCH');
  });

  it('rejects a withdrawn candidate', () => {
    const result = validateBallot(config, employee, {
      ...completeEmployeeBallot,
      president: 'p3',
    });
    expect(codes(result)).toContain('INACTIVE_CANDIDATE');
    expect(result.issues[0]?.message).toMatch(/withdrawn/i);
  });

  it('rejects the same candidate id submitted for two positions', () => {
    // A candidate cannot be registered for two positions (config load rejects a
    // duplicate id), so a client sending one id twice must fail on the position
    // it does not belong to.
    const result = validateBallot(config, employee, { president: 'p1', 'vice-president': 'p1' });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('CANDIDATE_POSITION_MISMATCH');
  });

  it('flags a genuine duplicate when one candidate legitimately matches two keys', () => {
    // Guard for a future configuration that allows cross-position candidacies:
    // DUPLICATE_SELECTION must fire rather than silently counting one person twice.
    const shared = makeConfig({
      positions: config.positions.map((p) =>
        p.id === 'vice-president' ? { ...p, id: 'president-alt', order: 9 } : p,
      ),
      candidates: config.candidates.map((c) =>
        c.positionId === 'vice-president' ? { ...c, positionId: 'president-alt' } : c,
      ),
    });
    const result = validateBallot(
      shared,
      { ...employee },
      { president: 'p1', 'president-alt': 'p1' },
    );
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('CANDIDATE_POSITION_MISMATCH');
  });
});

describe('validateBallot — hostile input', () => {
  it('ignores prototype-pollution keys rather than treating them as positions', () => {
    const hostile = JSON.parse('{"__proto__":"x","president":"p1","vice-president":"v1"}');
    const result = validateBallot(config, employee, hostile);
    expect(result.valid).toBe(true);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('rejects a non-object payload instead of throwing', () => {
    const result = validateBallot(config, employee, [] as unknown as Record<string, string>);
    expect(result.valid).toBe(false);
    expect(codes(result)).toEqual(['MALFORMED_SELECTIONS']);
  });

  it('treats empty-string selections as missing, not as a vote', () => {
    const result = validateBallot(config, employee, { president: '', 'vice-president': 'v1' });
    expect(result.missingPositionIds).toEqual(['president']);
  });
});
