/**
 * Destructive: wipe election data.
 *
 * Refuses to run under NODE_ENV=production without --i-understand, because the
 * immutability triggers deliberately make this the *only* way to remove a
 * ballot, and that should never be a reflex.
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../config/env.js';

const env = loadEnv();
const force = process.argv.includes('--i-understand');
const codesOnly = process.argv.includes('--codes');

if (env.NODE_ENV === 'production' && !force) {
  console.error(
    '\nRefusing to reset a production database.\n' +
      'If you really mean it, take a backup first, then re-run with --i-understand.\n',
  );
  process.exit(1);
}

if (codesOnly) {
  const { openDatabase } = await import('../db/index.js');
  const db = openDatabase(env.DATABASE_PATH);
  const changed = db
    .prepare('UPDATE voters SET access_code_hash = NULL, access_code_salt = NULL')
    .run().changes;
  db.close();
  console.log(`Purged access-code hashes for ${changed} voters. Participation is untouched.`);
  process.exit(0);
}

const path = resolve(env.DATABASE_PATH);
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${path}${suffix}`, { force: true });
}
console.log(`Removed ${path} (and its WAL files). Run \`npm run seed\` to start over.`);
