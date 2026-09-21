/** Structured errors. Every one names what is wrong and where, never "invalid input". */

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ConfigValidationError extends Error {
  override readonly name = 'ConfigValidationError';
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(
      `Election configuration is invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n'),
    );
  }
}

/**
 * Thrown when tallies reference a candidate that is not in the configuration.
 * Results are not a place for best-effort: we refuse to publish numbers we
 * cannot fully explain.
 */
export class UnknownCandidateError extends Error {
  override readonly name = 'UnknownCandidateError';
  constructor(
    readonly candidateId: string,
    readonly positionId: string,
  ) {
    super(
      `Tally references candidate "${candidateId}" for position "${positionId}", ` +
        `which is not in the election configuration. Refusing to calculate results.`,
    );
  }
}

/** Thrown when a position's eligible voter types carry no weight between them. */
export class WeightingError extends Error {
  override readonly name = 'WeightingError';
  constructor(message: string) {
    super(message);
  }
}
