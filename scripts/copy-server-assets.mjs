#!/usr/bin/env node
/** tsc does not copy .sql files; the compiled server needs its schema beside it. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Non-TS assets tsc leaves behind, which the compiled server needs beside it. */
const ASSETS = ['src/db/schema.sql', 'src/http/monitor.html'];

for (const asset of ASSETS) {
  const to = join(process.cwd(), asset.replace(/^src\//, 'dist/'));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(process.cwd(), asset), to);
}
console.log(`✓ copied ${ASSETS.length} asset(s) into dist`);
