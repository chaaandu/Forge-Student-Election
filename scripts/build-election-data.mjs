#!/usr/bin/env node
/**
 * Build the real election configuration and voter roll.
 *
 * Sources (kept out of git — they contain personal data):
 *   • Forge_C27_House_Allocation - Sheet1.pdf   students, houses, emails
 *   • Elections Team.xlsx                       employees, emails
 *   • CANDIDATES below                          transcribed from the shortlist
 *
 * Re-run this whenever any of those change. It validates as it goes and
 * refuses to write a configuration the server would reject.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const students = JSON.parse(readFileSync('/tmp/students.json', 'utf8'));
const employees = JSON.parse(readFileSync('/tmp/employees.json', 'utf8'));

/**
 * Houses, as Bauhaus fields.
 *
 * Colour AND form, following Kandinsky's correspondence (red square, blue
 * circle, yellow triangle) with the arc as the fourth. Identity never rests on
 * colour alone. Text-safe variants of each colour are derived at runtime by
 * apps/web/src/lib/color.ts and asserted in the contrast test.
 */
const HOUSES = [
  { id: 'samurai', name: 'Samurai', color: '#DE2B1F', shape: 'square' },
  { id: 'knights', name: 'Knights', color: '#1B4D9B', shape: 'circle' },
  { id: 'gladiators', name: 'Gladiators', color: '#FFC20E', shape: 'triangle' },
  { id: 'vikings', name: 'Vikings', color: '#1E7A4C', shape: 'arc' },
];

/**
 * The shortlist as supplied.
 *
 * House captains: ONE captain per house, contested by two candidates (one male,
 * one female). Confirm this reading — the alternative (a separate boy captain
 * and girl captain per house) would make all eight candidates unopposed, which
 * would make the vote meaningless.
 */
const CANDIDATES = {
  president: ['Yashansh Savla', 'Sairaj G', 'Abhishek Gaur', 'Itish Pande'],
  // 'Divyam Pawan Arora' on the shortlist; the roll says 'Divyam Arora'. Using the
  // roll spelling so the ballot matches every other school record. Confirm.
  'vice-president': ['Preethi S', 'Abhishek Kambalath', 'Divyam Arora'],
  'academic-lead-boy': ['Adnaan R', 'Udhav Kothari'],
  // 'Jenessa Bhatena' on the shortlist; the roll says 'Jenessa Bhathena'. Typo, corrected.
  'academic-lead-girl': ['Kalika Srivastava', 'Jenessa Bhathena'],
  'community-lead-boy': ['Akash Ghorpade', 'Risheet Gangar', 'Archit Pathak'],
  'community-lead-girl': ['Kavya Zala', 'Rishika Choudhary', 'Riya Kothavade'],
  'house-captain-samurai': ['Adnaan R', 'Zalak Gogri'],
  'house-captain-knights': ['Preet Jain', 'Arpita Mahata'],
  'house-captain-vikings': ['Dhyay Amit Popat', 'Maitree Shah'],
  'house-captain-gladiators': ['Aarav Shrivastava', 'Bhavya Tandon'],
};

const LEADERSHIP = [
  ['president', 'President', 'President'],
  ['vice-president', 'Vice President', 'Vice President'],
  ['academic-lead-boy', 'Academic Lead — Boy', 'Academic Lead (Boy)'],
  ['academic-lead-girl', 'Academic Lead — Girl', 'Academic Lead (Girl)'],
  ['community-lead-boy', 'Community Lead — Boy', 'Community Lead (Boy)'],
  ['community-lead-girl', 'Community Lead — Girl', 'Community Lead (Girl)'],
];

const slug = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------------------------------------------------------------- build ---
const positions = LEADERSHIP.map(([id, title, shortTitle], index) => ({
  id,
  title,
  shortTitle,
  order: index + 1,
  kind: 'leadership',
  eligibility: { voterTypes: ['student', 'employee'] },
}));

HOUSES.forEach((house, index) => {
  positions.push({
    id: `house-captain-${house.id}`,
    title: `House Captain — ${house.name}`,
    shortTitle: `${house.name} Captain`,
    order: 7 + index,
    kind: 'house-captain',
    houseId: house.id,
    // Students of this house only. Employees have no house-captain step at all;
    // that falls out of this one field, not out of a branch anywhere in code.
    eligibility: { voterTypes: ['student'], houseId: house.id },
  });
});

const candidates = [];
for (const [positionId, names] of Object.entries(CANDIDATES)) {
  for (const name of names) {
    candidates.push({
      id: `${positionId}--${slug(name)}`,
      name,
      positionId,
      photoUrl: `/candidates/${positionId}--${slug(name)}.svg`,
      active: true,
    });
  }
}

const config = {
  election: {
    id: 'mesa-forge-c27',
    name: 'Mesa Student Elections',
    status: 'open',
    weights: { student: 0.75, employee: 0.25 },
    zeroTurnoutPolicy: 'renormalise',
  },
  houses: HOUSES,
  positions,
  candidates,
};

const houseIdByName = Object.fromEntries(HOUSES.map((h) => [h.name, h.id]));
const voters = [
  ...students.map((s) => ({
    id: `stu-${slug(s.email.split('@')[0])}`,
    name: s.name,
    email: s.email,
    type: 'student',
    houseId: houseIdByName[s.house],
  })),
  ...employees.map((e) => ({
    id: `emp-${slug(e.email.split('@')[0])}`,
    name: e.name,
    email: e.email,
    type: 'employee',
  })),
];

// --------------------------------------------------------------- checks ---
const problems = [];
const notes = [];

for (const voter of voters) {
  if (!voter.name) problems.push(`voter ${voter.id} has no name`);
  if (voter.type === 'student' && !voter.houseId)
    problems.push(`student ${voter.name} has no house`);
}

const rollByName = new Map(voters.map((v) => [v.name?.toLowerCase(), v]));
for (const candidate of candidates) {
  const match = rollByName.get(candidate.name.toLowerCase());
  if (!match) {
    notes.push(`candidate "${candidate.name}" (${candidate.positionId}) is not on the student roll`);
  } else if (candidate.positionId.startsWith('house-captain-')) {
    const houseId = candidate.positionId.replace('house-captain-', '');
    if (match.houseId !== houseId)
      problems.push(
        `${candidate.name} stands for ${houseId} but is in ${match.houseId} on the roll`,
      );
  }
}

const standingTwice = new Map();
for (const candidate of candidates) {
  const key = candidate.name.toLowerCase();
  standingTwice.set(key, (standingTwice.get(key) ?? 0) + 1);
}
for (const [name, count] of standingTwice) {
  if (count > 1) notes.push(`"${name}" is standing for ${count} positions — confirm this is intended`);
}

writeFileSync('apps/server/config/election.config.json', JSON.stringify(config, null, 2) + '\n');
writeFileSync('apps/server/config/voters.json', JSON.stringify(voters, null, 2) + '\n');

console.log(`✓ ${positions.length} positions · ${candidates.length} candidates · ${voters.length} voters`);
console.log(`  students ${voters.filter((v) => v.type === 'student').length} · employees ${voters.filter((v) => v.type === 'employee').length}`);
for (const house of HOUSES) {
  console.log(`  ${house.name.padEnd(11)} ${voters.filter((v) => v.houseId === house.id).length}`);
}
if (notes.length) {
  console.log('\nWorth checking:');
  for (const note of notes) console.log(`  • ${note}`);
}
if (problems.length) {
  console.error('\n✗ Problems:');
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}
