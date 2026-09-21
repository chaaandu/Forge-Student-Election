import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  BallotSelectionRow,
  CandidateRow,
  ExcelHealth,
  ExcelRepository,
  ResultRow,
  VoterParticipationRow,
} from './types.js';

/**
 * Development mirror: spools to JSONL on disk instead of Microsoft 365.
 *
 * Deliberately *not* a no-op. The sync path — enqueue, claim, send, mark — is
 * fully exercised in development, so the first time it runs against a real
 * workbook is not the first time it runs at all.
 */
export class NullExcelRepository implements ExcelRepository {
  readonly mode = 'null' as const;

  constructor(private readonly dir: string) {
    mkdirSync(resolve(dir), { recursive: true });
  }

  private write(file: string, rows: readonly unknown[]): void {
    if (rows.length === 0) return;
    const lines = rows.map((r) => JSON.stringify({ at: new Date().toISOString(), row: r }));
    appendFileSync(join(resolve(this.dir), file), `${lines.join('\n')}\n`, 'utf8');
  }

  async appendVoterParticipation(rows: readonly VoterParticipationRow[]): Promise<void> {
    this.write('voters.jsonl', rows);
  }

  async appendBallotSelections(rows: readonly BallotSelectionRow[]): Promise<void> {
    this.write('ballots.jsonl', rows);
  }

  async upsertCandidates(rows: readonly CandidateRow[]): Promise<void> {
    this.write('candidates.jsonl', rows);
  }

  async appendResults(rows: readonly ResultRow[]): Promise<void> {
    this.write('results.jsonl', rows);
  }

  async health(): Promise<ExcelHealth> {
    return {
      ok: true,
      mode: 'null',
      detail: `Spooling to ${resolve(this.dir)} — no Microsoft 365 connection is configured.`,
    };
  }
}
