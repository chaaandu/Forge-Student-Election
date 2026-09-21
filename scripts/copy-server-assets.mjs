#!/usr/bin/env node
/** tsc does not copy .sql files; the compiled server needs its schema beside it. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const from = join(process.cwd(), 'src/db/schema.sql');
const to = join(process.cwd(), 'dist/db/schema.sql');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('✓ copied schema.sql into dist');
