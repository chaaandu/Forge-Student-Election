/** Structured errors. Every one names what is wrong and where, never "invalid input". */
export class ConfigValidationError extends Error {
    issues;
    name = 'ConfigValidationError';
    constructor(issues) {
        super(`Election configuration is invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
            issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n'));
        this.issues = issues;
    }
}
/**
 * Thrown when tallies reference a candidate that is not in the configuration.
 * Results are not a place for best-effort: we refuse to publish numbers we
 * cannot fully explain.
 */
export class UnknownCandidateError extends Error {
    candidateId;
    positionId;
    name = 'UnknownCandidateError';
    constructor(candidateId, positionId) {
        super(`Tally references candidate "${candidateId}" for position "${positionId}", ` +
            `which is not in the election configuration. Refusing to calculate results.`);
        this.candidateId = candidateId;
        this.positionId = positionId;
    }
}
/** Thrown when a position's eligible voter types carry no weight between them. */
export class WeightingError extends Error {
    name = 'WeightingError';
    constructor(message) {
        super(message);
    }
}
//# sourceMappingURL=errors.js.map