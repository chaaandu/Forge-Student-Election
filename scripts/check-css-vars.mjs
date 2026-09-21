#!/usr/bin/env node
/**
 * Every `var(--x)` must resolve to something.
 *
 * WHY THIS EXISTS. Three design directions have been built and discarded in
 * this app, and each one left custom properties behind in components that
 * survived it. An undefined custom property is silent: the browser does not
 * warn, the build does not fail, and the unit tests pass because jsdom never
 * computes CSS. It just makes the declaration "invalid at computed-value time"
 * and drops the whole property.
 *
 * It cost us the signature interaction. `InkMark` asked for `--ease-ink`, which
 * had gone with the direction that defined it, so the `animation` shorthand was
 * dropped — while the inline `stroke-dashoffset: 58` it was meant to wipe to 0
 * stayed. The path is 43.9 long, so the stroke sat permanently outside its own
 * dash window and the tick was INVISIBLE in every browser. On the ballot that
 * meant an empty box on a card reading "Selected", and a progress row where
 * none of the answered steps were marked. Four more were dead alongside it.
 *
 * So: fail the build instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: the checkout directory has a space in it and
// .pathname hands back "Student%20Voting%20System".
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'apps/web/src');

/**
 * Properties set at runtime by a component, on the element or an ancestor,
 * rather than declared in a stylesheet. Each needs the component that writes
 * it, so an entry cannot outlive its author unnoticed.
 */
const RUNTIME_DEFINED = new Map([
  ['--field', 'CandidateCard / .field — set with inkOn()'],
  ['--on-field', 'CandidateCard / .field — set with inkOn()'],
  ['--from', 'PositionScreen — step-in direction'],
  ['--x', 'Burst — scatter offset'],
  ['--y', 'Burst — scatter offset'],
  ['--r', 'Burst — scatter rotation'],
  ['--cols', 'CandidateGrid — column count for this field size'],
  ['--cols-narrow', 'CandidateGrid — the same count below 940px'],
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(SRC).filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('__tests__'));

// Definitions come from the stylesheets that are actually imported. A property
// defined only in an orphaned file is not defined at all.
const entry = readFileSync(join(SRC, 'styles/global.css'), 'utf8');
const imported = [...entry.matchAll(/@import\s+'\.\/([\w.-]+)'/g)].map((m) => m[1]);
const stylesheets = ['global.css', ...imported].map((name) => join(SRC, 'styles', name));

const defined = new Set();
for (const sheet of stylesheets) {
  for (const match of readFileSync(sheet, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
    defined.add(match[1]);
  }
}

const problems = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const name = match[1];
      // A fallback — var(--x, something) — is a deliberate optional read.
      const rest = line.slice(match.index + match[0].length);
      if (/^\s*,/.test(rest)) continue;
      if (defined.has(name) || RUNTIME_DEFINED.has(name)) continue;
      problems.push({ file: relative(ROOT, file), line: index + 1, name });
    }
  });
}

if (problems.length > 0) {
  console.error('\n  Undefined CSS custom properties\n');
  for (const { file, line, name } of problems) {
    console.error(`    ${file}:${line}  ${name}`);
  }
  console.error(
    '\n  Each of these silently drops the whole declaration that uses it.\n' +
      '  Define it in src/styles/tokens.css, or add it to RUNTIME_DEFINED in\n' +
      '  scripts/check-css-vars.mjs if a component sets it at runtime.\n',
  );
  process.exit(1);
}

console.log(`  css vars     ${defined.size} defined, every var() resolves`);
