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
 * Properties one file sets and ANOTHER file reads. These are the only ones that
 * need declaring here, because a same-file definition is found automatically —
 * see `definedIn` below.
 */
const RUNTIME_DEFINED = new Map([
  ['--field', 'CandidateCard sets it; global.css .field reads it'],
  ['--on-field', 'CandidateCard sets it; global.css .field reads it'],
]);

/**
 * Custom properties a file defines for itself.
 *
 * Two forms count, and both are ordinary practice here rather than loopholes:
 *
 *   `--x: value`            a rule inside the component's own <style> block
 *   `['--x' as string]: v`  an inline style on the element
 *
 * Without this the checker only believed the shared stylesheets, so a component
 * that set a variable on itself and read it two lines later was reported as
 * broken. That is a false positive, and a checker that cries wolf is one people
 * start passing an allowlist to — which is how the real ones get waved through.
 */
function definedIn(source) {
  const local = new Set();
  for (const m of source.matchAll(/(--[\w-]+)\s*:/g)) local.add(m[1]);
  for (const m of source.matchAll(/\[\s*'(--[\w-]+)'/g)) local.add(m[1]);
  return local;
}

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
  const local = definedIn(source);
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const name = match[1];
      // A fallback — var(--x, something) — is a deliberate optional read.
      const rest = line.slice(match.index + match[0].length);
      if (/^\s*,/.test(rest)) continue;
      if (defined.has(name) || local.has(name) || RUNTIME_DEFINED.has(name)) continue;
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
      '  Define it in src/styles/tokens.css, in the component\'s own <style>\n' +
      '  block, or as an inline style on the element. Add it to RUNTIME_DEFINED\n' +
      '  in scripts/check-css-vars.mjs only when one file sets it and another\n' +
      '  reads it.\n',
  );
  process.exit(1);
}

console.log(`  css vars     ${defined.size} defined, every var() resolves`);
