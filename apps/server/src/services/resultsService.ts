import {
  calculateResults,
  countElectorate,
  type ElectionConfig,
  type ElectionResults,
  type Voter,
  type VoterType,
} from '@mesa/election-core';
import type { ElectionRepository } from '../db/electionRepository.js';
import type { AuditRepository } from '../db/auditRepository.js';
import type { OutboxRepository } from '../db/outboxRepository.js';
import type { ResultRow } from '../excel/types.js';

/**
 * Results are aggregates over anonymous ballots, computed by the pure engine in
 * election-core. This service does the I/O and nothing else — no election rule
 * lives here.
 */
export class ResultsService {
  constructor(
    private readonly repo: ElectionRepository,
    private readonly audit: AuditRepository,
    private readonly outbox: OutboxRepository,
    private readonly config: ElectionConfig,
    private readonly voters: readonly Voter[],
  ) {}

  calculate(now: Date = new Date()): ElectionResults {
    const electionId = this.config.election.id;
    const results = calculateResults({
      config: this.config,
      tallies: this.repo.tallies(electionId),
      electorate: countElectorate(this.config, this.voters),
      ballotsByType: this.repo.ballotCountsByType(electionId),
      now,
    });

    this.audit.append(
      {
        event: 'RESULTS_GENERATED',
        actorType: 'admin',
        metadata: {
          positions: results.positions.length,
          ballots: this.repo.countBallots(electionId),
        },
      },
      now,
    );

    return results;
  }

  turnout() {
    const raw = this.repo.turnout(this.config.election.id);
    const byType: Record<string, { eligible: number; voted: number; rate: number }> = {};
    for (const [type, counts] of Object.entries(raw.byType)) {
      byType[type] = {
        ...counts,
        rate: counts.eligible === 0 ? 0 : counts.voted / counts.eligible,
      };
    }
    const eligible = Object.values(raw.byType).reduce((s, c) => s + c.eligible, 0);
    const voted = Object.values(raw.byType).reduce((s, c) => s + c.voted, 0);
    return {
      overall: { eligible, voted, rate: eligible === 0 ? 0 : voted / eligible },
      byType,
    };
  }

  /** Flatten results for the workbook, one row per candidate per position. */
  toExcelRows(results: ElectionResults): ResultRow[] {
    const rows: ResultRow[] = [];
    for (const position of results.positions) {
      for (const candidate of position.candidates) {
        const student = candidate.perType.student;
        const employee = candidate.perType.employee;
        rows.push({
          position: position.positionTitle,
          weightingApplied: position.weightingLabel,
          candidate: candidate.candidateName,
          // An ineligible group gets a blank cell, never a zero: a reader must
          // not mistake "could not vote here" for "voted for nobody".
          studentVotes: student ? student.votes : '',
          studentPct: student ? round(student.share * 100) : '',
          studentContribution: student ? round(student.contribution) : '',
          employeeVotes: employee ? employee.votes : '',
          employeePct: employee ? round(employee.share * 100) : '',
          employeeContribution: employee ? round(employee.contribution) : '',
          weightedScore: round(candidate.finalScore),
          rank: candidate.rank,
          tied: candidate.tied,
          generatedAt: results.generatedAt,
        });
      }
    }
    return rows;
  }

  /** Queue a results snapshot for the workbook via the same outbox as ballots. */
  publishToExcel(results: ElectionResults, now: Date = new Date()): void {
    this.outbox.enqueue(
      'results_snapshot',
      `results:${results.generatedAt}`,
      this.toExcelRows(results),
      now,
    );
  }

  participationByType(): Partial<Record<VoterType, number>> {
    return this.repo.ballotCountsByType(this.config.election.id);
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
