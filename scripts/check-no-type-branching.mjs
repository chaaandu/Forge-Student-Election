#!/usr/bin/env node
/**
 * Integrity check: election behaviour must be derived from configuration, not
 * from `if (voter.type === 'employee')`.
 *
 * "Employees do not vote for house captains" is a fact about the election
 * configuration (docs/voting-logic.md §2). The moment it becomes a branch in a
 * service or a component, it stops being configurable and starts being a bug
 * waiting for next year's election.
 *
 * A genuinely presentational use — a tag colour, a sentence of copy — is
 * allowed, but must say so with a `// eligibility-branch-ok: <reason>` comment
 * on the preceding line. That keeps every exception visible and justified.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['packages/election-core/src', 'apps/server/src', 'apps/web/src'];

/** The one module allowed to know what a voter type means. */
const EXEMPT_FILES = [
  'packages/election-core/src/eligibility.ts',
  'packages/election-core/src/types.ts',
  'packages/election-core/src/config.ts',
];

const PATTERNS = [
  /\.type\s*===\s*['"](?:student|employee)['"]/,
  /voterType\s*===\s*['"](?:student|employee)['"]/,
  /\.type\s*!==\s*['"](?:student|employee)['"]/,
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const root of ROOTS) {
  let files;
  try {
    files = walk(join(ROOT, root));
  } catch {
    continue;
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (EXEMPT_FILES.includes(rel)) continue;

    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!PATTERNS.some((pattern) => pattern.test(line))) return;
      const previous = lines[index - 1] ?? '';
      if (previous.includes('eligibility-branch-ok:')) return;
      violations.push(`${rel}:${index + 1}\n    ${line.trim()}`);
    });
  }
}

if (violations.length > 0) {
  console.error(
    `\n✗ Election behaviour is branching on voter type in ${violations.length} place(s):\n\n` +
      violations.map((v) => `  ${v}`).join('\n\n') +
      `\n\n  Derive it from position.eligibility instead (docs/voting-logic.md §2).\n` +
      `  If this really is presentation only, add on the line above:\n` +
      `      // eligibility-branch-ok: <why this is not an election rule>\n`,
  );
  process.exit(1);
}

console.log('✓ No election logic branches on voter type.');
