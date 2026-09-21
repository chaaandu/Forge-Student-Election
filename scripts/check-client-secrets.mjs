#!/usr/bin/env node
/**
 * Integrity check: no server secret may be referenced from the browser bundle.
 *
 * Vite only exposes `VITE_`-prefixed variables, so a non-prefixed name in the
 * web app is either dead code or — worse — someone about to "fix" it by adding
 * the prefix. Both are caught here, before a build ships.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WEB = join(ROOT, 'apps/web');

const FORBIDDEN = [
  'ADMIN_API_TOKEN',
  'ACCESS_CODE_PEPPER',
  'HASH_SALT',
  'MICROSOFT_CLIENT_SECRET',
  'EXCEL_CLIENT_SECRET',
  'SERVER_SECRET',
  'DATABASE_PATH',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?|html|css)$/.test(full)) out.push(full);
  }
  return out;
}

const problems = [];

for (const file of walk(WEB)) {
  const contents = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  for (const secret of FORBIDDEN) {
    if (contents.includes(secret)) {
      problems.push(`${rel} references ${secret}, which must never leave the server.`);
    }
  }

  // Any import.meta.env read that is not VITE_-prefixed is a mistake.
  for (const match of contents.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
    const name = match[1];
    if (!name.startsWith('VITE_') && !['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'].includes(name)) {
      problems.push(`${rel} reads import.meta.env.${name}, which Vite will not provide.`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✗ Secret-shaped references found in the browser bundle:\n`);
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('✓ No server secrets are referenced from the web app.');
