import { parseElectionConfig } from '../config.js';
import type { ElectionConfig, Voter } from '../types.js';

/**
 * A deliberately small election that still exercises every structural case:
 * positions open to both groups, house-scoped positions open to students only,
 * two houses, and an inactive candidate.
 */
export function makeConfig(overrides: Record<string, unknown> = {}): ElectionConfig {
  const base = {
    election: {
      id: 'test-election',
      name: 'Test Election',
      status: 'open',
      weights: { student: 0.75, employee: 0.25 },
      zeroTurnoutPolicy: 'renormalise',
    },
    houses: [
      { id: 'aravalli', name: 'Aravalli', color: '#E4572E' },
      { id: 'nilgiri', name: 'Nilgiri', color: '#2E86AB' },
    ],
    positions: [
      {
        id: 'president',
        title: 'President',
        order: 1,
        kind: 'leadership',
        eligibility: { voterTypes: ['student', 'employee'] },
      },
      {
        id: 'vice-president',
        title: 'Vice President',
        order: 2,
        kind: 'leadership',
        eligibility: { voterTypes: ['student', 'employee'] },
      },
      {
        id: 'house-captain-aravalli',
        title: 'House Captain — Aravalli',
        order: 3,
        kind: 'house-captain',
        houseId: 'aravalli',
        eligibility: { voterTypes: ['student'], houseId: 'aravalli' },
      },
      {
        id: 'house-captain-nilgiri',
        title: 'House Captain — Nilgiri',
        order: 4,
        kind: 'house-captain',
        houseId: 'nilgiri',
        eligibility: { voterTypes: ['student'], houseId: 'nilgiri' },
      },
    ],
    candidates: [
      { id: 'p1', name: 'Alpha President', positionId: 'president', active: true },
      { id: 'p2', name: 'Beta President', positionId: 'president', active: true },
      { id: 'p3', name: 'Gamma President', positionId: 'president', active: false },
      { id: 'v1', name: 'Alpha Vice', positionId: 'vice-president', active: true },
      { id: 'v2', name: 'Beta Vice', positionId: 'vice-president', active: true },
      { id: 'a1', name: 'Aravalli One', positionId: 'house-captain-aravalli', active: true },
      { id: 'a2', name: 'Aravalli Two', positionId: 'house-captain-aravalli', active: true },
      { id: 'n1', name: 'Nilgiri One', positionId: 'house-captain-nilgiri', active: true },
    ],
    ...overrides,
  };
  return parseElectionConfig(base);
}

export const studentAravalli: Voter = {
  id: 'v-stu-1',
  name: 'Student Aravalli',
  email: 'stu1@example.edu',
  type: 'student',
  houseId: 'aravalli',
};

export const studentNilgiri: Voter = {
  id: 'v-stu-2',
  name: 'Student Nilgiri',
  email: 'stu2@example.edu',
  type: 'student',
  houseId: 'nilgiri',
};

export const employee: Voter = {
  id: 'v-emp-1',
  name: 'Employee One',
  email: 'emp1@example.edu',
  type: 'employee',
};

export const completeStudentBallot = {
  president: 'p1',
  'vice-president': 'v1',
  'house-captain-aravalli': 'a1',
};

export const completeEmployeeBallot = {
  president: 'p1',
  'vice-president': 'v1',
};
