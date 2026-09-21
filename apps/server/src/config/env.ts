import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

/**
 * Environment parsing with production guards.
 *
 * The server refuses to start rather than run an election with a placeholder
 * secret or an unauthenticated identity provider. A misconfigured election that
 * boots is far more dangerous than one that does not.
 */

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER = /replace-me|changeme|example|xxxx/i;

const bool = z
  .string()
  .transform((v) => v.toLowerCase() === 'true' || v === '1')
  .pipe(z.boolean());

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().positive());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(8787),
  DEV_CORS_ORIGIN: z.string().default('http://localhost:5173'),

  ELECTION_CONFIG_PATH: z.string().default('./config/election.config.json'),
  VOTER_ROLL_PATH: z.string().default('./config/voters.json'),
  DATABASE_PATH: z.string().default('./data/elections.sqlite'),

  AUTH_MODE: z.enum(['entra', 'access-code', 'dev']).default('dev'),
  KIOSK_TOKEN: z.string().default('dev-kiosk-token'),
  ACCESS_CODE_PEPPER: z.string().default('dev-access-code-pepper'),
  HASH_SALT: z.string().default('dev-hash-salt'),
  SESSION_TTL_MINUTES: int(20),

  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().optional(),

  EXCEL_MODE: z.enum(['graph', 'null']).default('null'),
  EXCEL_TENANT_ID: z.string().optional(),
  EXCEL_CLIENT_ID: z.string().optional(),
  EXCEL_CLIENT_SECRET: z.string().optional(),
  EXCEL_DRIVE_ID: z.string().optional(),
  EXCEL_WORKBOOK_ID: z.string().optional(),
  EXCEL_TABLE_VOTERS: z.string().default('Voters'),
  EXCEL_TABLE_CANDIDATES: z.string().default('Candidates'),
  EXCEL_TABLE_BALLOTS: z.string().default('Ballots'),
  EXCEL_TABLE_RESULTS: z.string().default('Results'),
  EXCEL_SPOOL_DIR: z.string().default('./.excel-spool'),

  SYNC_ENABLED: bool.default(true),
  SYNC_INTERVAL_MS: int(5000),
  SYNC_BATCH_SIZE: int(25),
  SYNC_MAX_ATTEMPTS: int(8),

  ADMIN_API_TOKEN: z.string().default('dev-admin-token'),
});

export type Env = z.infer<typeof schema>;

export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';
  constructor(problems: readonly string[]) {
    super(
      `Refusing to start — the environment is not safe for this NODE_ENV:\n` +
        problems.map((p) => `  • ${p}`).join('\n') +
        `\n\nSee .env.example and docs/security-model.md §10.`,
    );
  }
}

function productionGuards(env: Env): string[] {
  const problems: string[] = [];

  if (env.AUTH_MODE === 'dev') {
    problems.push(
      'AUTH_MODE=dev performs no identity verification. Set AUTH_MODE=entra or access-code.',
    );
  }

  const secrets: [string, string][] = [
    ['ADMIN_API_TOKEN', env.ADMIN_API_TOKEN],
    ['KIOSK_TOKEN', env.KIOSK_TOKEN],
    ['HASH_SALT', env.HASH_SALT],
  ];
  if (env.AUTH_MODE === 'access-code') secrets.push(['ACCESS_CODE_PEPPER', env.ACCESS_CODE_PEPPER]);

  for (const [name, value] of secrets) {
    if (value.length < MIN_SECRET_LENGTH)
      problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters.`);
    else if (PLACEHOLDER.test(value))
      problems.push(`${name} still contains a placeholder value. Run: npm run gen:secrets`);
  }

  if (env.AUTH_MODE === 'entra') {
    for (const key of [
      'MICROSOFT_TENANT_ID',
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_CLIENT_SECRET',
      'MICROSOFT_REDIRECT_URI',
    ] as const) {
      if (!env[key]) problems.push(`${key} is required when AUTH_MODE=entra.`);
    }
    if (env.MICROSOFT_REDIRECT_URI && !env.MICROSOFT_REDIRECT_URI.startsWith('https://'))
      problems.push('MICROSOFT_REDIRECT_URI must be https in production.');
  }

  if (env.EXCEL_MODE === 'graph') {
    for (const key of [
      'EXCEL_TENANT_ID',
      'EXCEL_CLIENT_ID',
      'EXCEL_CLIENT_SECRET',
      'EXCEL_DRIVE_ID',
      'EXCEL_WORKBOOK_ID',
    ] as const) {
      if (!env[key]) problems.push(`${key} is required when EXCEL_MODE=graph.`);
    }
  }

  return problems;
}

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvironmentError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }

  const value = parsed.data;
  if (value.NODE_ENV === 'production') {
    const problems = productionGuards(value);
    if (problems.length > 0) throw new EnvironmentError(problems);
  }

  return value;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test helper: forget the memoised environment. */
export function resetEnvCache(): void {
  cached = undefined;
}
