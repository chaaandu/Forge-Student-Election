import type { PublicElection, VoterProfile } from '@/lib/api';
import type { Position } from '@mesa/election-core';

const position = (
  id: string,
  title: string,
  order: number,
  kind: 'leadership' | 'house-captain',
  voterTypes: ('student' | 'employee')[],
  houseId?: string,
): Position => ({
  id,
  title,
  order,
  kind,
  ...(houseId ? { houseId } : {}),
  eligibility: { voterTypes, ...(houseId ? { houseId } : {}) },
});

export const election: PublicElection = {
  election: { id: 'e1', name: 'Test Election', status: 'open' },
  houses: [
    { id: 'aravalli', name: 'Aravalli', color: '#E4572E' },
    { id: 'nilgiri', name: 'Nilgiri', color: '#2E86AB' },
  ],
  positions: [
    position('president', 'President', 1, 'leadership', ['student', 'employee']),
    position('vice-president', 'Vice President', 2, 'leadership', ['student', 'employee']),
    position('academic-lead-boy', 'Academic Lead — Boy', 3, 'leadership', ['student', 'employee']),
    position('academic-lead-girl', 'Academic Lead — Girl', 4, 'leadership', ['student', 'employee']),
    position('community-lead-boy', 'Community Lead — Boy', 5, 'leadership', ['student', 'employee']),
    position('community-lead-girl', 'Community Lead — Girl', 6, 'leadership', ['student', 'employee']),
    position('house-captain-aravalli', 'House Captain — Aravalli', 7, 'house-captain', ['student'], 'aravalli'),
    position('house-captain-nilgiri', 'House Captain — Nilgiri', 8, 'house-captain', ['student'], 'nilgiri'),
  ],
  candidates: [
    { id: 'p1', name: 'Alpha', positionId: 'president', active: true },
    { id: 'p2', name: 'Beta', positionId: 'president', active: true },
    { id: 'v1', name: 'Vee', positionId: 'vice-president', active: true },
    { id: 'ab1', name: 'AB One', positionId: 'academic-lead-boy', active: true },
    { id: 'ag1', name: 'AG One', positionId: 'academic-lead-girl', active: true },
    { id: 'cb1', name: 'CB One', positionId: 'community-lead-boy', active: true },
    { id: 'cg1', name: 'CG One', positionId: 'community-lead-girl', active: true },
    { id: 'a1', name: 'Aravalli One', positionId: 'house-captain-aravalli', active: true },
    { id: 'n1', name: 'Nilgiri One', positionId: 'house-captain-nilgiri', active: true },
  ],
  window: { open: true },
  auth: { mode: 'dev', supportsRollSearch: true },
  configVersion: 'test',
};

const LEADERSHIP = [
  'president',
  'vice-president',
  'academic-lead-boy',
  'academic-lead-girl',
  'community-lead-boy',
  'community-lead-girl',
];

export const student: VoterProfile = {
  id: 'stu-1',
  name: 'Student One',
  email: 'stu1@seed.invalid',
  type: 'student',
  houseId: 'aravalli',
  hasVoted: false,
  eligiblePositionIds: [...LEADERSHIP, 'house-captain-aravalli'],
};

export const employee: VoterProfile = {
  id: 'emp-1',
  name: 'Employee One',
  email: 'emp1@seed.invalid',
  type: 'employee',
  houseId: null,
  hasVoted: false,
  eligiblePositionIds: [...LEADERSHIP],
};

export const STUDENT_CHOICES: Record<string, string> = {
  president: 'p1',
  'vice-president': 'v1',
  'academic-lead-boy': 'ab1',
  'academic-lead-girl': 'ag1',
  'community-lead-boy': 'cb1',
  'community-lead-girl': 'cg1',
  'house-captain-aravalli': 'a1',
};
