import type { ElectionConfig, Voter } from '@mesa/election-core';
import { loadEnv, type Env } from './config/env.js';
import { openDatabase, setMeta, type Db } from './db/index.js';
import { AuditRepository } from './db/auditRepository.js';
import { ElectionRepository } from './db/electionRepository.js';
import { IdempotencyRepository } from './db/idempotencyRepository.js';
import { OutboxRepository } from './db/outboxRepository.js';
import { assertNotSeedDataInProduction, loadElection } from './election/configStore.js';
import { createIdentityProvider, type AnyIdentityProvider } from './identity/index.js';
import { ExcelGraphRepository } from './spreadsheet/excelGraphRepository.js';
import {
  GoogleSheetsRepository,
  loadServiceAccount,
} from './spreadsheet/googleSheetsRepository.js';
import { LocalSpoolRepository } from './spreadsheet/spoolRepository.js';
import type { SpreadsheetRepository } from './spreadsheet/types.js';
import { ElectionReset } from './services/electionReset.js';
import { ResultsPublisher } from './services/resultsPublisher.js';
import { ResultsService } from './services/resultsService.js';
import { SessionService } from './services/sessionService.js';
import { SyncWorker } from './services/syncWorker.js';
import { VotingService } from './services/votingService.js';

export interface AppContext {
  readonly env: Env;
  readonly db: Db;
  readonly config: ElectionConfig;
  readonly voters: readonly Voter[];
  readonly configVersion: string;
  readonly repo: ElectionRepository;
  readonly audit: AuditRepository;
  readonly outbox: OutboxRepository;
  readonly idempotency: IdempotencyRepository;
  readonly sessions: SessionService;
  readonly voting: VotingService;
  readonly results: ResultsService;
  readonly publisher: ResultsPublisher;
  readonly reset: ElectionReset;
  readonly excel: SpreadsheetRepository;
  readonly sync: SyncWorker;
  readonly identity: AnyIdentityProvider;
}

export interface CreateContextOptions {
  readonly env?: Env;
  /** Injected in tests so the Excel path can be exercised without Microsoft 365. */
  readonly excel?: SpreadsheetRepository;
  /** Skip writing the roll into the database (already seeded). */
  readonly skipVoterSync?: boolean;
}

/**
 * Compose the application.
 *
 * Wiring lives here and nowhere else, so every service receives its
 * dependencies explicitly and each one can be constructed in isolation by a
 * test. There are no module-level singletons.
 */
/**
 * Choose the spreadsheet mirror.
 *
 * Isolated so the decision is one readable function rather than a ternary
 * buried in the wiring, and so a future target (a CSV drop, nothing at all) is
 * one more case here and no change anywhere above.
 */
function createSpreadsheetRepository(env: Env): SpreadsheetRepository {
  switch (env.SPREADSHEET_MODE) {
    case 'sheets':
      return new GoogleSheetsRepository({
        spreadsheetId: env.SHEETS_SPREADSHEET_ID ?? '',
        tabs: {
          voters: env.SHEETS_TAB_VOTERS,
          candidates: env.SHEETS_TAB_CANDIDATES,
          ballots: env.SHEETS_TAB_BALLOTS,
          results: env.SHEETS_TAB_RESULTS,
        },
        serviceAccount: loadServiceAccount(
          env.GOOGLE_SERVICE_ACCOUNT_JSON,
          env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        ),
      });

    case 'excel':
      return new ExcelGraphRepository({
        tenantId: env.EXCEL_TENANT_ID ?? '',
        clientId: env.EXCEL_CLIENT_ID ?? '',
        clientSecret: env.EXCEL_CLIENT_SECRET ?? '',
        driveId: env.EXCEL_DRIVE_ID ?? '',
        workbookId: env.EXCEL_WORKBOOK_ID ?? '',
        tables: {
          voters: env.EXCEL_TABLE_VOTERS,
          candidates: env.EXCEL_TABLE_CANDIDATES,
          ballots: env.EXCEL_TABLE_BALLOTS,
          results: env.EXCEL_TABLE_RESULTS,
        },
      });

    case 'spool':
      return new LocalSpoolRepository(env.EXCEL_SPOOL_DIR);
  }
}

export function createContext(options: CreateContextOptions = {}): AppContext {
  const env = options.env ?? loadEnv();
  const { config, voters, configVersion } = loadElection(
    env.ELECTION_CONFIG_PATH,
    env.VOTER_ROLL_PATH,
  );

  assertNotSeedDataInProduction(config, env.NODE_ENV);

  const db = openDatabase(env.DATABASE_PATH);
  const repo = new ElectionRepository(db);
  const audit = new AuditRepository(db);
  const outbox = new OutboxRepository(db);
  const idempotency = new IdempotencyRepository(db);

  if (!options.skipVoterSync) {
    const insert = db.transaction(() => {
      for (const voter of voters) repo.upsertVoter(voter, config.election.id);
    });
    insert();
  }

  setMeta(db, 'config_version', configVersion);
  setMeta(db, 'election_id', config.election.id);
  audit.append({
    event: 'ELECTION_CONFIG_LOADED',
    actorType: 'system',
    subjectId: config.election.id,
    metadata: {
      configVersion,
      positions: config.positions.length,
      candidates: config.candidates.length,
      voters: voters.length,
      status: config.election.status,
      authMode: env.AUTH_MODE,
    },
  });

  const excel = options.excel ?? createSpreadsheetRepository(env);
  const results = new ResultsService(repo, audit, outbox, config, voters);

  return {
    env,
    db,
    config,
    voters,
    configVersion,
    repo,
    audit,
    outbox,
    idempotency,
    excel,
    sessions: new SessionService(db, repo, env.HASH_SALT, env.SESSION_TTL_MINUTES),
    voting: new VotingService(db, repo, audit, idempotency, outbox, config, configVersion),
    results: results,
    publisher: new ResultsPublisher(db, repo, results, config.election.id, {
      intervalMs: env.RESULTS_PUBLISH_INTERVAL_MS,
    }),
    reset: new ElectionReset(db, repo, audit, excel, config, voters),
    sync: new SyncWorker(outbox, excel, audit, {
      intervalMs: env.SYNC_INTERVAL_MS,
      batchSize: env.SYNC_BATCH_SIZE,
      maxAttempts: env.SYNC_MAX_ATTEMPTS,
    }),
    identity: createIdentityProvider(env, db, repo, config.election.id),
  };
}
