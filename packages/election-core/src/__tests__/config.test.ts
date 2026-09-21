import { describe, expect, it } from 'vitest';
import { parseElectionConfig, parseVoterRoll } from '../config.js';
import { ConfigValidationError } from '../errors.js';
import { employee, makeConfig, studentAravalli } from './fixtures.js';

const config = makeConfig();

function expectInvalid(fn: () => unknown, match: RegExp): void {
  try {
    fn();
    throw new Error('expected configuration to be rejected, but it was accepted');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigValidationError);
    expect((error as ConfigValidationError).message).toMatch(match);
  }
}

describe('weights', () => {
  it('accepts weights that sum to 1', () => {
    expect(config.election.weights).toEqual({ student: 0.75, employee: 0.25 });
  });

  it('rejects weights that do not sum to 1', () => {
    expectInvalid(
      () => makeConfig({ election: { ...config.election, weights: { student: 0.8, employee: 0.3 } } }),
      /sum to exactly 1/,
    );
  });

  it('rejects a negative weight', () => {
    try {
      makeConfig({ election: { ...config.election, weights: { student: 1.2, employee: -0.2 } } });
      throw new Error('expected a negative weight to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const paths = (error as ConfigValidationError).issues.map((i) => i.path);
      expect(paths).toContain('election.weights.employee');
      expect(paths).toContain('election.weights.student');
    }
  });

  it('rejects a non-numeric weight', () => {
    expectInvalid(
      () =>
        makeConfig({
          election: { ...config.election, weights: { student: 'lots', employee: 0.25 } },
        }),
      /number|expected/i,
    );
  });

  it('tolerates floating point representation error', () => {
    const ok = makeConfig({
      election: { ...config.election, weights: { student: 0.1 + 0.2, employee: 0.7 } },
    });
    expect(ok.election.weights.student).toBeCloseTo(0.3, 10);
  });
});

describe('structural rules', () => {
  it('rejects a position with an empty voterTypes list', () => {
    expectInvalid(
      () =>
        makeConfig({
          positions: config.positions.map((p) =>
            p.id === 'president' ? { ...p, eligibility: { voterTypes: [] } } : p,
          ),
        }),
      /at least one voter type/,
    );
  });

  it('rejects a house-captain position with no house scope', () => {
    expectInvalid(
      () =>
        makeConfig({
          positions: config.positions.map((p) =>
            p.id === 'house-captain-aravalli'
              ? { ...p, eligibility: { voterTypes: ['student'] } }
              : p,
          ),
        }),
      /must set eligibility.houseId/,
    );
  });

  it('rejects a position with no active candidates', () => {
    expectInvalid(
      () =>
        makeConfig({
          candidates: config.candidates.map((c) =>
            c.positionId === 'vice-president' ? { ...c, active: false } : c,
          ),
        }),
      /no active candidates/,
    );
  });

  it('rejects an orphan candidate', () => {
    expectInvalid(
      () =>
        makeConfig({
          candidates: [
            ...config.candidates,
            { id: 'orphan', name: 'Orphan', positionId: 'treasurer', active: true },
          ],
        }),
      /is not a declared position/,
    );
  });

  it('rejects duplicate position order, which would make the gate sequence ambiguous', () => {
    expectInvalid(
      () =>
        makeConfig({
          positions: config.positions.map((p) => (p.id === 'vice-president' ? { ...p, order: 1 } : p)),
        }),
      /duplicate order/,
    );
  });

  it('rejects an unknown house reference', () => {
    expectInvalid(
      () =>
        makeConfig({
          positions: config.positions.map((p) =>
            p.id === 'house-captain-aravalli'
              ? { ...p, houseId: 'himalaya', eligibility: { voterTypes: ['student'], houseId: 'himalaya' } }
              : p,
          ),
        }),
      /not a declared house/,
    );
  });

  it('rejects a javascript: photo URL', () => {
    expectInvalid(
      () =>
        makeConfig({
          candidates: config.candidates.map((c) =>
            c.id === 'p1' ? { ...c, photoUrl: 'javascript:alert(1)' } : c,
          ),
        }),
      /root-relative path|https/,
    );
  });

  it('rejects an http photo URL to avoid mixed content', () => {
    expectInvalid(
      () =>
        makeConfig({
          candidates: config.candidates.map((c) =>
            c.id === 'p1' ? { ...c, photoUrl: 'http://example.com/p.jpg' } : c,
          ),
        }),
      /https/,
    );
  });

  it('reports every problem at once, not just the first', () => {
    try {
      makeConfig({
        candidates: [
          { id: 'x', name: 'X', positionId: 'nope', active: true },
          { id: 'x', name: 'X again', positionId: 'also-nope', active: true },
        ],
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as ConfigValidationError).issues.length).toBeGreaterThan(2);
    }
  });
});

describe('voter roll', () => {
  it('accepts a valid roll', () => {
    expect(parseVoterRoll([studentAravalli, employee], config)).toHaveLength(2);
  });

  it('rejects a student with no house when house contests exist', () => {
    expect(() =>
      parseVoterRoll([{ ...studentAravalli, houseId: undefined }], config),
    ).toThrow(/silently lose their house captain vote/);
  });

  it('rejects duplicate emails, case-insensitively', () => {
    expect(() =>
      parseVoterRoll(
        [studentAravalli, { ...studentAravalli, id: 'other', email: 'STU1@EXAMPLE.EDU' }],
        config,
      ),
    ).toThrow(/duplicate email/);
  });

  it('rejects a voter eligible for nothing', () => {
    const employeesOnlyHouses = makeConfig({
      positions: config.positions.filter((p) => p.kind === 'house-captain'),
      candidates: config.candidates.filter((c) => c.positionId.startsWith('house-captain')),
    });
    expect(() => parseVoterRoll([employee], employeesOnlyHouses)).toThrow(/eligible for no positions/);
  });

  it('rejects a malformed email', () => {
    expect(() => parseVoterRoll([{ ...employee, email: 'not-an-email' }], config)).toThrow(
      ConfigValidationError,
    );
  });

  it('rejects an invalid voter type', () => {
    expect(() => parseVoterRoll([{ ...employee, type: 'alumni' }], config)).toThrow(
      ConfigValidationError,
    );
  });

  it('rejects a house that does not exist', () => {
    expect(() => parseVoterRoll([{ ...studentAravalli, houseId: 'himalaya' }], config)).toThrow(
      /not a declared house/,
    );
  });
});

describe('parseElectionConfig', () => {
  it('defaults zeroTurnoutPolicy to renormalise when omitted', () => {
    const parsed = parseElectionConfig({
      election: {
        id: 'e',
        name: 'E',
        status: 'open',
        weights: { student: 0.75, employee: 0.25 },
      },
      houses: [],
      positions: [
        {
          id: 'p',
          title: 'P',
          order: 1,
          kind: 'leadership',
          eligibility: { voterTypes: ['student'] },
        },
      ],
      candidates: [{ id: 'c', name: 'C', positionId: 'p', active: true }],
    });
    expect(parsed.election.zeroTurnoutPolicy).toBe('renormalise');
  });
});
