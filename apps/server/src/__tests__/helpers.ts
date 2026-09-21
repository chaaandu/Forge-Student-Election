import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadEnv } from '../config/env.js';
import { createContext, type AppContext } from '../context.js';
import { createApp } from '../http/app.js';
import type { ExcelRepository } from '../excel/types.js';

export const TEST_KIOSK_TOKEN = 'test-kiosk-token-0123456789abcdef';
export const TEST_ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

/** Small but structurally complete: both groups, two houses, an inactive candidate. */
export function testElectionConfig(overrides: Record<string, unknown> = {}) {
  return {
    election: {
      id: 'test-election',
      name: 'Test Election',
      status: 'open',
      weights: { student: 0.75, employee: 0.25 },
      zeroTurnoutPolicy: 'renormalise',
      ...(overrides.election as object | undefined),
    },
    houses: [
      { id: 'aravalli', name: 'Aravalli', color: '#E4572E' },
      { id: 'nilgiri', name: 'Nilgiri', color: '#2E86AB' },
    ],
    positions: [
      {
        id: 'president',
        title: 'President',
        order: 1,
        kind: 'leadership',
        eligibility: { voterTypes: ['student', 'employee'] },
      },
      {
        id: 'vice-president',
        title: 'Vice President',
        order: 2,
        kind: 'leadership',
        eligibility: { voterTypes: ['student', 'employee'] },
      },
      {
        id: 'house-captain-aravalli',
        title: 'House Captain — Aravalli',
        order: 3,
        kind: 'house-captain',
        houseId: 'aravalli',
        eligibility: { voterTypes: ['student'], houseId: 'aravalli' },
      },
      {
        id: 'house-captain-nilgiri',
        title: 'House Captain — Nilgiri',
        order: 4,
        kind: 'house-captain',
        houseId: 'nilgiri',
        eligibility: { voterTypes: ['student'], houseId: 'nilgiri' },
      },
    ],
    candidates: [
      { id: 'p1', name: 'Alpha President', positionId: 'president', active: true },
      { id: 'p2', name: 'Beta President', positionId: 'president', active: true },
      { id: 'p3', name: 'Withdrawn President', positionId: 'president', active: false },
      { id: 'v1', name: 'Alpha Vice', positionId: 'vice-president', active: true },
      { id: 'v2', name: 'Beta Vice', positionId: 'vice-president', active: true },
      { id: 'a1', name: 'Aravalli One', positionId: 'house-captain-aravalli', active: true },
      { id: 'a2', name: 'Aravalli Two', positionId: 'house-captain-aravalli', active: true },
      { id: 'n1', name: 'Nilgiri One', positionId: 'house-captain-nilgiri', active: true },
    ],
    ...(({ election: _e, ...rest }) => rest)(overrides),
  };
}

export const TEST_VOTERS = [
  { id: 'stu-1', name: 'Student One', email: 'stu1@seed.invalid', type: 'student', houseId: 'aravalli' },
  { id: 'stu-2', name: 'Student Two', email: 'stu2@seed.invalid', type: 'student', houseId: 'nilgiri' },
  { id: 'stu-3', name: 'Student Three', email: 'stu3@seed.invalid', type: 'student', houseId: 'aravalli' },
  { id: 'emp-1', name: 'Employee One', email: 'emp1@seed.invalid', type: 'employee' },
  { id: 'emp-2', name: 'Employee Two', email: 'emp2@seed.invalid', type: 'employee' },
];

export interface TestHarness {
  ctx: AppContext;
  dir: string;
  dbPath: string;
  dispose(): void;
}

export function createHarness(
  options: {
    config?: Record<string, unknown>;
    voters?: unknown[];
    excel?: ExcelRepository;
    envOverrides?: Record<string, string>;
  } = {},
): TestHarness {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-test-'));
  const configPath = join(dir, 'election.config.json');
  const rollPath = join(dir, 'voters.json');
  const dbPath = join(dir, 'election.sqlite');

  writeFileSync(configPath, JSON.stringify(testElectionConfig(options.config ?? {})));
  writeFileSync(rollPath, JSON.stringify(options.voters ?? TEST_VOTERS));

  const env = loadEnv({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    EXCEL_MODE: 'null',
    SYNC_ENABLED: 'false',
    KIOSK_TOKEN: TEST_KIOSK_TOKEN,
    ADMIN_API_TOKEN: TEST_ADMIN_TOKEN,
    HASH_SALT: 'test-hash-salt-0123456789abcdef',
    ACCESS_CODE_PEPPER: 'test-pepper-0123456789abcdef0123',
    ELECTION_CONFIG_PATH: configPath,
    VOTER_ROLL_PATH: rollPath,
    DATABASE_PATH: dbPath,
    EXCEL_SPOOL_DIR: join(dir, 'spool'),
    ...options.envOverrides,
  } as NodeJS.ProcessEnv);

  const ctx = createContext({ env, ...(options.excel ? { excel: options.excel } : {}) });

  return {
    ctx,
    dir,
    dbPath,
    dispose() {
      ctx.sync.stop();
      ctx.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface TestServer {
  url: string;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function startServer(harness: TestHarness): Promise<TestServer> {
  const app = createApp(harness.ctx);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    ctx: harness.ctx,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/** Check in as a voter and return the bearer token (dev identity provider). */
export async function checkIn(server: TestServer, voterId: string): Promise<string> {
  const response = await fetch(`${server.url}/api/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kiosk-token': TEST_KIOSK_TOKEN },
    body: JSON.stringify({ voterId }),
  });
  if (!response.ok) throw new Error(`check-in failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { token: string };
  return body.token;
}

export const STUDENT_BALLOT = {
  president: 'p1',
  'vice-president': 'v1',
  'house-captain-aravalli': 'a1',
};

export const EMPLOYEE_BALLOT = { president: 'p1', 'vice-president': 'v1' };

export async function submitBallot(
  server: TestServer,
  token: string,
  selections: Record<string, string>,
  idempotencyKey = crypto.randomUUID(),
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${server.url}/api/ballots`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ selections }),
  });
  return { status: response.status, body: await response.json() };
}
