/**
 * Domain types for the Mesa election system.
 *
 * Nothing in this package knows about HTTP, React, or SQLite. Every election
 * rule that matters lives here so it can be tested in isolation and shared
 * verbatim between the browser (for instant feedback) and the server (which is
 * the only authority).
 */
/**
 * The voter groups that exist in the system.
 *
 * Adding a group is a two-step change: add it here, and give it a weight in
 * `election.weights`. Weight renormalisation (see results.ts) already handles
 * an arbitrary number of groups, and eligibility is declared per position, so
 * no branching logic needs to change.
 */
export const VOTER_TYPES = ['student', 'employee'];
export const ELECTION_STATUSES = ['draft', 'open', 'closed'];
export const POSITION_KINDS = ['leadership', 'house-captain'];
/**
 * How to treat a voter group that is eligible for a position but cast no votes
 * at all. See docs/voting-logic.md §6.1 — this is a governance decision, not a
 * technical one, which is why it is configuration.
 */
export const ZERO_TURNOUT_POLICIES = ['renormalise', 'treat-as-zero'];
//# sourceMappingURL=types.js.map