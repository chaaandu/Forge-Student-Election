import { describe, expect, it } from 'vitest';
import { calculateResults, resolveEffectiveWeights, TIE_TOLERANCE } from '../results.js';
import { UnknownCandidateError, WeightingError } from '../errors.js';
import { countElectorate } from '../eligibility.js';
import type { Tally, VoterType } from '../types.js';
import { employee, makeConfig, studentAravalli, studentNilgiri } from './fixtures.js';

const config = makeConfig();

const tally = (
  positionId: string,
  candidateId: string,
  voterType: VoterType,
  votes: number,
): Tally => ({ positionId, candidateId, voterType, votes });

const position = (results: ReturnType<typeof calculateResults>, id: string) => {
  const found = results.positions.find((p) => p.positionId === id);
  if (!found) throw new Error(`no result for ${id}`);
  return found;
};

const candidate = (p: ReturnType<typeof position>, id: string) => {
  const found = p.candidates.find((c) => c.candidateId === id);
  if (!found) throw new Error(`no result for candidate ${id}`);
  return found;
};

describe('weighted leadership positions (75/25)', () => {
  it('matches the worked example from docs/voting-logic.md §5', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 60),
        tally('president', 'p2', 'student', 58),
        tally('president', 'p1', 'employee', 10),
        tally('president', 'p2', 'employee', 10),
      ],
    });

    const president = position(results, 'president');
    const winner = candidate(president, 'p1');

    expect(president.weightingBasis).toBe('WEIGHTED');
    expect(president.weightingLabel).toBe('Weighted 75/25 (student/employee)');
    expect(winner.perType.student).toMatchObject({ votes: 60, totalVotes: 118, weight: 0.75 });
    expect(winner.perType.student?.share).toBeCloseTo(60 / 118, 12);
    expect(winner.perType.student?.contribution).toBeCloseTo((60 / 118) * 0.75, 12);
    expect(winner.perType.employee?.contribution).toBeCloseTo(0.5 * 0.25, 12);
    expect(winner.finalScore).toBeCloseTo((60 / 118) * 0.75 + 0.5 * 0.25, 12);
    expect(winner.finalScorePercent).toBeCloseTo(50.64, 2);
  });

  it('does not depend on the size of either group', () => {
    // Same shares, ten times the people. The scores must be identical, which is
    // what proves no roll size is baked into the arithmetic.
    const small = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 6),
        tally('president', 'p2', 'student', 4),
        tally('president', 'p1', 'employee', 1),
        tally('president', 'p2', 'employee', 1),
      ],
    });
    const large = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 600),
        tally('president', 'p2', 'student', 400),
        tally('president', 'p1', 'employee', 100),
        tally('president', 'p2', 'employee', 100),
      ],
    });
    expect(candidate(position(large, 'president'), 'p1').finalScore).toBeCloseTo(
      candidate(position(small, 'president'), 'p1').finalScore,
      12,
    );
  });

  it('gives a small employee group its full 25% rather than its head-count share', () => {
    // 2 employees against 100 students. Naive per-vote weighting would make the
    // employee group irrelevant; independent normalisation does not.
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 51),
        tally('president', 'p2', 'student', 49),
        tally('president', 'p2', 'employee', 2),
      ],
    });
    const p = position(results, 'president');
    expect(candidate(p, 'p2').finalScore).toBeCloseTo(0.49 * 0.75 + 1 * 0.25, 12);
    expect(p.winner?.candidateId).toBe('p2');
  });

  it('awards a clean sweep a score of exactly 1', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 90),
        tally('president', 'p1', 'employee', 12),
      ],
    });
    expect(candidate(position(results, 'president'), 'p1').finalScore).toBeCloseTo(1, 12);
    expect(candidate(position(results, 'president'), 'p2').finalScore).toBe(0);
  });
});

describe('house captain positions use student-only weighting', () => {
  const results = calculateResults({
    config,
    tallies: [
      tally('house-captain-aravalli', 'a1', 'student', 20),
      tally('house-captain-aravalli', 'a2', 'student', 10),
    ],
  });
  const house = position(results, 'house-captain-aravalli');

  it('reports SINGLE_GROUP, not the 75/25 rule', () => {
    expect(house.weightingBasis).toBe('SINGLE_GROUP');
    expect(house.weightingLabel).toBe('Student-only (100%)');
    expect(house.effectiveWeights).toEqual({ student: 1 });
  });

  it('never produces an employee breakdown for an ineligible group', () => {
    expect(candidate(house, 'a1').perType.employee).toBeUndefined();
    expect(Object.keys(candidate(house, 'a1').perType)).toEqual(['student']);
  });

  it('scores 100% of the student vote as 100%, not 75%', () => {
    const sweep = calculateResults({
      config,
      tallies: [tally('house-captain-aravalli', 'a1', 'student', 30)],
    });
    const a1 = candidate(position(sweep, 'house-captain-aravalli'), 'a1');
    expect(a1.finalScore).toBe(1);
    expect(a1.finalScorePercent).toBe(100);
  });

  it('splits proportionally within the house', () => {
    expect(candidate(house, 'a1').finalScore).toBeCloseTo(20 / 30, 12);
    expect(candidate(house, 'a2').finalScore).toBeCloseTo(10 / 30, 12);
    expect(house.winner?.candidateId).toBe('a1');
  });
});

describe('ineligible group vs eligible-but-silent group', () => {
  it('treats an ineligible group structurally: renormalise, always', () => {
    const { weights, basis } = resolveEffectiveWeights(
      config,
      config.positions.find((p) => p.id === 'house-captain-aravalli')!,
      {},
    );
    expect(basis).toBe('NO_VOTES');
    expect(weights).toEqual({ student: 1 });
  });

  it('renormalises when an eligible group casts nothing (default policy)', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 80),
        tally('president', 'p2', 'student', 20),
      ],
    });
    const p = position(results, 'president');

    expect(p.weightingBasis).toBe('RENORMALISED_ZERO_TURNOUT');
    expect(p.weightingLabel).toBe('Student-only (100%) — employee eligible but cast no votes');
    expect(p.effectiveWeights).toEqual({ student: 1 });
    expect(candidate(p, 'p1').finalScore).toBeCloseTo(0.8, 12);
    // The employee breakdown is still present — the group WAS eligible, and a
    // reader must be able to see that they cast zero votes.
    expect(candidate(p, 'p1').perType.employee).toMatchObject({ votes: 0, totalVotes: 0, share: 0 });
  });

  it('retains the weight under treat-as-zero, capping scores at 75%', () => {
    const strict = makeConfig({
      election: { ...config.election, zeroTurnoutPolicy: 'treat-as-zero' },
    });
    const results = calculateResults({
      config: strict,
      tallies: [
        tally('president', 'p1', 'student', 80),
        tally('president', 'p2', 'student', 20),
      ],
    });
    const p = position(results, 'president');

    expect(p.weightingBasis).toBe('ZERO_TURNOUT_RETAINED');
    expect(p.weightingLabel).toMatch(/maximum attainable score is 75%/);
    expect(candidate(p, 'p1').finalScore).toBeCloseTo(0.8 * 0.75, 12);
  });

  it('produces the same ranking under both policies — this is presentation, not outcome', () => {
    const tallies = [
      tally('president', 'p1', 'student', 55),
      tally('president', 'p2', 'student', 45),
    ];
    const renormalised = calculateResults({ config, tallies });
    const retained = calculateResults({
      config: makeConfig({ election: { ...config.election, zeroTurnoutPolicy: 'treat-as-zero' } }),
      tallies,
    });

    const order = (r: ReturnType<typeof calculateResults>) =>
      position(r, 'president').candidates.map((c) => `${c.candidateId}:${c.rank}`);
    expect(order(renormalised)).toEqual(order(retained));
    expect(renormalised.positions[0]?.winner?.candidateId).toBe(
      retained.positions[0]?.winner?.candidateId,
    );
  });

  it('renormalises when only students are silent', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'employee', 7),
        tally('president', 'p2', 'employee', 3),
      ],
    });
    const p = position(results, 'president');
    expect(p.effectiveWeights).toEqual({ employee: 1 });
    expect(p.weightingLabel).toBe('Employee-only (100%) — student eligible but cast no votes');
    expect(candidate(p, 'p1').finalScore).toBeCloseTo(0.7, 12);
  });
});

describe('zero votes', () => {
  it('never divides by zero and declares no winner', () => {
    const results = calculateResults({ config, tallies: [] });
    for (const p of results.positions) {
      expect(p.weightingBasis).toBe('NO_VOTES');
      expect(p.weightingLabel).toBe('No votes cast');
      expect(p.winner).toBeNull();
      for (const c of p.candidates) {
        expect(c.finalScore).toBe(0);
        expect(Number.isNaN(c.finalScore)).toBe(false);
        expect(Number.isFinite(c.finalScore)).toBe(true);
      }
    }
  });

  it('gives an uncontested-but-unvoted candidate 0, not NaN', () => {
    const results = calculateResults({
      config,
      tallies: [tally('president', 'p1', 'student', 5)],
    });
    const vp = position(results, 'vice-president');
    expect(vp.candidates.every((c) => c.finalScore === 0)).toBe(true);
  });
});

describe('ties', () => {
  it('reports a two-way tie and declares no winner', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 50),
        tally('president', 'p2', 'student', 50),
        tally('president', 'p1', 'employee', 5),
        tally('president', 'p2', 'employee', 5),
      ],
    });
    const p = position(results, 'president');
    const leaders = p.candidates.filter((c) => c.rank === 1);

    expect(leaders).toHaveLength(2);
    expect(leaders.every((c) => c.tied)).toBe(true);
    expect(p.winner).toBeNull();
  });

  it('uses competition ranking: 1, 1, 3', () => {
    const threeWay = makeConfig({
      candidates: [
        { id: 'p1', name: 'A', positionId: 'president', active: true },
        { id: 'p2', name: 'B', positionId: 'president', active: true },
        { id: 'p3', name: 'C', positionId: 'president', active: true },
        ...config.candidates.filter((c) => c.positionId !== 'president'),
      ],
    });
    const results = calculateResults({
      config: threeWay,
      tallies: [
        tally('president', 'p1', 'student', 10),
        tally('president', 'p2', 'student', 10),
        tally('president', 'p3', 'student', 5),
      ],
    });
    expect(position(results, 'president').candidates.map((c) => c.rank)).toEqual([1, 1, 3]);
  });

  it('treats scores within the float tolerance as tied rather than ordered', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 1),
        tally('president', 'p2', 'student', 1),
        tally('president', 'p1', 'employee', 1),
        tally('president', 'p2', 'employee', 1),
      ],
    });
    const [first, second] = position(results, 'president').candidates;
    expect(Math.abs((first?.finalScore ?? 0) - (second?.finalScore ?? 0))).toBeLessThan(
      TIE_TOLERANCE,
    );
    expect(first?.tied).toBe(true);
  });

  it('declares a winner when a three-way race has a clear leader', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 60),
        tally('president', 'p2', 'student', 40),
      ],
    });
    expect(position(results, 'president').winner?.candidateId).toBe('p1');
  });
});

describe('data integrity', () => {
  it('refuses to calculate when a tally names an unknown candidate', () => {
    expect(() =>
      calculateResults({ config, tallies: [tally('president', 'ghost', 'student', 5)] }),
    ).toThrow(UnknownCandidateError);
  });

  it('refuses when a tally pairs a real candidate with the wrong position', () => {
    expect(() =>
      calculateResults({ config, tallies: [tally('vice-president', 'p1', 'student', 5)] }),
    ).toThrow(UnknownCandidateError);
  });

  it('refuses a negative vote count', () => {
    expect(() =>
      calculateResults({ config, tallies: [tally('president', 'p1', 'student', -1)] }),
    ).toThrow(WeightingError);
  });

  it('counts a withdrawn candidate’s votes but marks them inactive', () => {
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p3', 'student', 10),
        tally('president', 'p1', 'student', 5),
      ],
    });
    const withdrawn = candidate(position(results, 'president'), 'p3');
    expect(withdrawn.active).toBe(false);
    expect(withdrawn.perType.student?.votes).toBe(10);
  });
});

describe('turnout', () => {
  it('measures house captain turnout against that house only', () => {
    const roll = [studentAravalli, studentNilgiri, employee];
    const results = calculateResults({
      config,
      tallies: [
        tally('president', 'p1', 'student', 2),
        tally('president', 'p1', 'employee', 1),
        tally('house-captain-aravalli', 'a1', 'student', 1),
      ],
      electorate: countElectorate(config, roll),
      ballotsByType: { student: 2, employee: 1 },
    });

    expect(position(results, 'president').turnout).toMatchObject({
      eligibleVoters: 3,
      ballotsCast: 3,
      turnoutRate: 1,
    });
    const house = position(results, 'house-captain-aravalli').turnout;
    expect(house?.eligibleVoters).toBe(1);
    expect(house?.byType.employee).toBeUndefined();
    expect(results.participation).toEqual({
      student: { ballots: 2 },
      employee: { ballots: 1 },
    });
  });

  it('omits turnout entirely rather than inventing it', () => {
    const results = calculateResults({ config, tallies: [] });
    expect(results.positions.every((p) => p.turnout === undefined)).toBe(true);
  });
});

describe('extensibility', () => {
  it('renormalises correctly for a position open to one of three weighted groups', () => {
    // Simulates a future third voter type by giving a position a single eligible
    // group whose configured weight is a fraction: it must still resolve to 1.0.
    const p = config.positions.find((x) => x.id === 'house-captain-nilgiri')!;
    const { weights } = resolveEffectiveWeights(config, p, { student: 4 });
    expect(weights.student).toBe(1);
  });
});
