/**
 * Seed the database from the configured election and, with --codes, issue
 * one-time access codes.
 *
 * The plaintext codes are written to a git-ignored CSV, printed once, and never
 * stored: the system keeps only a scrypt hash with a per-voter salt and a global
 * pepper. It therefore cannot tell a voter their code — only issue a new one,
 * which is the correct property for a credential.
 */
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { openDatabase } from '../db/index.js';
import { ElectionRepository } from '../db/electionRepository.js';
import { loadElection } from '../election/configStore.js';
import { generateAccessCode, hashAccessCode } from '../lib/crypto.js';

const env = loadEnv();
const withCodes = process.argv.includes('--codes');

const { config, voters } = loadElection(env.ELECTION_CONFIG_PATH, env.VOTER_ROLL_PATH);
const db = openDatabase(env.DATABASE_PATH);
const repo = new ElectionRepository(db);

const issued: { id: string; name: string; email: string; code: string }[] = [];

db.transaction(() => {
  for (const voter of voters) {
    if (withCodes) {
      const code = generateAccessCode(6);
      const salt = randomBytes(16).toString('hex');
      repo.upsertVoter(voter, config.election.id, {
        hash: hashAccessCode(code, salt, env.ACCESS_CODE_PEPPER),
        salt,
      });
      issued.push({ id: voter.id, name: voter.name, email: voter.email, code });
    } else {
      repo.upsertVoter(voter, config.election.id);
    }
  }
})();

console.log(`Seeded ${voters.length} voters for "${config.election.name}".`);
if (config.election.isSeedData) {
  console.log(
    '\n  ⚠  This configuration is marked isSeedData: true.\n' +
      '     These are demo candidates and demo voters. The server will refuse to\n' +
      '     start with them under NODE_ENV=production.\n',
  );
}

if (withCodes) {
  const file = `access-codes-${config.election.id}-${Date.now()}.csv`;
  writeFileSync(
    file,
    'voter_id,name,email,access_code\n' +
      issued.map((r) => `${r.id},"${r.name}",${r.email},${r.code}`).join('\n') +
      '\n',
    'utf8',
  );
  console.log(
    `\nWrote ${issued.length} access codes to ${file}\n` +
      `  • This file is git-ignored and contains live credentials.\n` +
      `  • Print it, distribute the slips against student ID, then DELETE it.\n` +
      `  • The codes cannot be recovered afterwards — re-run with --codes to reissue.\n`,
  );
}

db.close();
