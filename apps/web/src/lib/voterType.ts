import type { VoterType } from '@mesa/election-core';

/**
 * A field colour per voter type.
 *
 * WHY THESE EXIST. On the review header an employee's avatar and their
 * `EMPLOYEE` tag were both ink, sitting side by side — two black blocks with a
 * name between them, reading as one smudge rather than two facts.
 *
 * WHY THESE HUES. The rule everywhere else is that colour means HOUSE, so a
 * type colour has to be audibly not-a-house. The four houses sit at roughly
 * 30° (Knights red), 85° (Vikings gold), 130° (Gladiators green) and 250°
 * (Samurai blue). These are picked at 300° and 205° — the two widest gaps left
 * — so neither can be mistaken for a house at a glance.
 *
 * WHY HEX, WHEN THEY WERE CHOSEN IN OKLCH. They were authored as
 * `oklch(0.58 0.14 300)` and `oklch(0.60 0.10 205)`, which is the right space
 * to pick two colours of matching lightness in. They are STORED as sRGB hex
 * because every function in lib/color.ts — inkOn, readableOn, accessibleField,
 * roleFor — parses hex, and all of it is unit tested against that. Putting a
 * second notation into the palette would mean rewriting the one part of this
 * system that has never been wrong.
 *
 * Both carry legible type: violet takes white at 4.53:1, teal takes black at
 * 4.87:1, and `accessibleField` picks which without being told.
 *
 * A RECORD, NOT A BRANCH. `TYPE_FIELD[voter.type]` rather than
 * `type === 'student' ? … : …`, so scripts/check-no-type-branching.mjs stays
 * satisfied and a third voter type would be a one-line addition here.
 */
export const TYPE_FIELD: Record<VoterType, string> = {
  student: '#8864C0', // oklch(0.58 0.14 300)
  employee: '#0F919C', // oklch(0.60 0.10 205)
};
