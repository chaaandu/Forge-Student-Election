import { describe, expect, it } from 'vitest';
import { countElectorate, isEligible } from '../eligibility.js';
import { buildSteps, isSequenceComplete, progressFor, remainingSteps } from '../steps.js';
import {
  completeStudentBallot,
  employee,
  makeConfig,
  studentAravalli,
  studentNilgiri,
} from './fixtures.js';

const config = makeConfig();
const position = (id: string) => {
  const found = config.positions.find((p) => p.id === id);
  if (!found) throw new Error(`no such position ${id}`);
  return found;
};

describe('isEligible', () => {
  it('lets both groups vote in leadership positions', () => {
    expect(isEligible(studentAravalli, position('president'))).toBe(true);
    expect(isEligible(employee, position('president'))).toBe(true);
  });

  it('excludes employees from house captain positions', () => {
    expect(isEligible(employee, position('house-captain-aravalli'))).toBe(false);
    expect(isEligible(employee, position('house-captain-nilgiri'))).toBe(false);
  });

  it('restricts a student to their own house', () => {
    expect(isEligible(studentAravalli, position('house-captain-aravalli'))).toBe(true);
    expect(isEligible(studentAravalli, position('house-captain-nilgiri'))).toBe(false);
    expect(isEligible(studentNilgiri, position('house-captain-nilgiri'))).toBe(true);
  });
});

describe('buildSteps', () => {
  it('gives an employee only the leadership gates', () => {
    const steps = buildSteps(config, employee);
    expect(steps.map((s) => s.id)).toEqual(['president', 'vice-president']);
  });

  it('gives an employee a progress total that matches their own journey', () => {
    const steps = buildSteps(config, employee);
    expect(progressFor(steps, 'vice-president')).toEqual({ current: 2, total: 2 });
    // The House Captains step never exists for them, so it cannot inflate the total.
    expect(steps.some((s) => s.kind === 'house-captain')).toBe(false);
  });

  it('gives a student the leadership gates plus exactly their own house', () => {
    expect(buildSteps(config, studentAravalli).map((s) => s.id)).toEqual([
      'president',
      'vice-president',
      'house-captain-aravalli',
    ]);
    expect(buildSteps(config, studentNilgiri).map((s) => s.id)).toEqual([
      'president',
      'vice-president',
      'house-captain-nilgiri',
    ]);
  });

  it('orders steps deterministically by configured order, not array order', () => {
    const shuffled = makeConfig({
      positions: [...config.positions].reverse().map((p) => ({ ...p })),
    });
    expect(buildSteps(shuffled, studentAravalli).map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('degrades gracefully when a student house has no captain contest', () => {
    const noCaptains = makeConfig({
      positions: config.positions.filter((p) => p.kind !== 'house-captain'),
      candidates: config.candidates.filter((c) => !c.positionId.startsWith('house-captain')),
    });
    expect(buildSteps(noCaptains, studentAravalli)).toHaveLength(2);
  });
});

describe('sequence completion', () => {
  it('is complete when every eligible gate has a selection', () => {
    const steps = buildSteps(config, studentAravalli);
    expect(isSequenceComplete(steps, completeStudentBallot)).toBe(true);
    expect(remainingSteps(steps, completeStudentBallot)).toHaveLength(0);
  });

  it('names what is still missing', () => {
    const steps = buildSteps(config, studentAravalli);
    const partial = { president: 'p1' };
    expect(remainingSteps(steps, partial).map((p) => p.id)).toEqual([
      'vice-president',
      'house-captain-aravalli',
    ]);
  });

  it('does not require an employee to fill a house gate', () => {
    const steps = buildSteps(config, employee);
    expect(isSequenceComplete(steps, { president: 'p1', 'vice-president': 'v1' })).toBe(true);
  });
});

describe('countElectorate', () => {
  it('counts house captain electorates against that house only', () => {
    const roll = [studentAravalli, studentNilgiri, employee];
    const counts = countElectorate(config, roll);

    expect(counts.get('president')).toEqual({ student: 2, employee: 1 });
    expect(counts.get('house-captain-aravalli')).toEqual({ student: 1 });
    expect(counts.get('house-captain-nilgiri')).toEqual({ student: 1 });
  });

  it('never reports an employee electorate for a student-only position', () => {
    const counts = countElectorate(config, [employee]);
    expect(counts.get('house-captain-aravalli')).toEqual({ student: 0 });
    expect(counts.get('house-captain-aravalli')).not.toHaveProperty('employee');
  });
});
