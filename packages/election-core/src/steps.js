import { eligiblePositions } from './eligibility.js';
/**
 * The voter's gate sequence.
 *
 * A student gets the leadership gates plus the captain contest for their own
 * house. An employee gets the leadership gates and nothing else — the House
 * Captains step is not hidden or disabled for them, it simply is not part of
 * their journey, including in the progress count.
 */
export function buildSteps(config, voter) {
    return eligiblePositions(config, voter);
}
/** Index of a position within the voter's own sequence, or -1. */
export function stepIndexOf(steps, positionId) {
    return steps.findIndex((p) => p.id === positionId);
}
/** Positions in this voter's sequence that still have no selection. */
export function remainingSteps(steps, selections) {
    return steps.filter((p) => !selections[p.id]);
}
/**
 * Whether every gate in *this voter's* sequence has a selection.
 *
 * Convenience for the UI only. The server never trusts it: it re-runs
 * `validateBallot` against the voter record it loaded itself.
 */
export function isSequenceComplete(steps, selections) {
    return remainingSteps(steps, selections).length === 0;
}
/** Progress for the route line: 1-based position in the voter's own sequence. */
export function progressFor(steps, positionId) {
    return { current: stepIndexOf(steps, positionId) + 1, total: steps.length };
}
//# sourceMappingURL=steps.js.map