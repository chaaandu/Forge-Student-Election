/**
 * The single eligibility predicate for the entire system.
 *
 * Everything — the step sequence, the progress denominator, the review screen,
 * client and server ballot validation, per-position weighting, and turnout —
 * derives from this one function. That is the whole point: "employees do not
 * vote for house captains" is a fact about the configuration, not a branch in
 * the code.
 */
export function isEligible(voter, position) {
    if (!position.eligibility.voterTypes.includes(voter.type))
        return false;
    if (position.eligibility.houseId !== undefined && voter.houseId !== position.eligibility.houseId)
        return false;
    return true;
}
/** Positions this voter may vote in, in gate order. */
export function eligiblePositions(config, voter) {
    return config.positions.filter((p) => isEligible(voter, p)).sort((a, b) => a.order - b.order);
}
/**
 * How many voters on the roll are eligible for each position, by type.
 *
 * Turnout for a house captain contest is measured against the students of that
 * house — which falls out of `isEligible` rather than being special-cased.
 */
export function countElectorate(config, voters) {
    const counts = new Map();
    for (const position of config.positions) {
        const byType = {};
        for (const type of position.eligibility.voterTypes)
            byType[type] = 0;
        for (const voter of voters) {
            if (isEligible(voter, position))
                byType[voter.type] = (byType[voter.type] ?? 0) + 1;
        }
        counts.set(position.id, byType);
    }
    return counts;
}
//# sourceMappingURL=eligibility.js.map