// @vitest-environment node
//
// A review tile's caption must fit on ONE line.
//
// The tile is a face with a caption under it, and the captions share a
// baseline across the grid. One that wraps to two lines pushes its name down
// and the row stops lining up — which is what happened to all four house
// captains, whose full titles are the longest on the ballot.
//
// WHERE THESE NUMBERS COME FROM. Measured in Chrome at the shipped tile width
// (212px), injecting the actual `.bh-pick__title` rules, having first ASSERTED
// that the element resolved to "Jost Variable" at 12px / 1.2px tracking.
//
// That assertion is not ceremony. Two earlier runs of the same measurement
// reported confident, plausible numbers while the dev server was down and
// Chrome was showing its own error page — everything was measured in
// system-ui at 15px. The guard is the only reason those runs were thrown away
// instead of written down here.
//
//   available, no crest       192px   (212 − 20 tile padding)
//   available, with crest     166px   (192 − 16 crest − 6 gap − borders)
//
//   "Girls’ Community Lead"   175px   widest full title, 1 line
//   "Gladiators House Captain" clamps to 166px and wraps — the bug
//   "Gladiators Captain"      150px   widest shortTitle, 1 line, 16px spare
//
// That is ~8.3px per character for this face at this size. A test cannot
// measure a webfont, so the budgets below are that measurement expressed in
// characters, set one character inside the limit so a rename has somewhere to
// go before it breaks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../server/config/election.config.json', import.meta.url)),
    'utf8',
  ),
) as { positions: { id: string; title: string; shortTitle?: string; houseId?: string }[] };

/** 166px ÷ ~8.3px/char is 19.9; one inside that. Tiles that carry a crest. */
const BUDGET_WITH_CREST = 19;
/** 192px ÷ ~8.3px/char is 23.1; one inside that. Tiles that do not. */
const BUDGET_PLAIN = 22;

const caption = (p: { title: string; shortTitle?: string }) => p.shortTitle ?? p.title;

describe('review tile captions fit on one line', () => {
  it.each(config.positions.map((p) => [p.title, p] as const))(
    '%s',
    (_title, position) => {
      const text = caption(position);
      const budget = position.houseId ? BUDGET_WITH_CREST : BUDGET_PLAIN;

      expect(
        text.length,
        `"${text}" is ${text.length} characters; a tile ${
          position.houseId ? 'with a crest' : 'without a crest'
        } holds about ${budget}. Give this position a shorter \`shortTitle\` in ` +
          `scripts/build-election-data.mjs rather than letting the caption wrap.`,
      ).toBeLessThanOrEqual(budget);
    },
  );

  /**
   * The failure this was written for, kept as a live example rather than a
   * memory. If someone deletes the shortTitles, this is what comes back.
   */
  it('proves the full house-captain titles are the ones that do NOT fit', () => {
    const houseCaptains = config.positions.filter((p) => p.houseId);
    expect(houseCaptains.length).toBeGreaterThan(0);

    for (const position of houseCaptains) {
      expect(position.shortTitle, `${position.id} has no shortTitle`).toBeTruthy();
      expect(position.title.length).toBeGreaterThan(BUDGET_WITH_CREST);
      expect(caption(position).length).toBeLessThanOrEqual(BUDGET_WITH_CREST);
    }
  });

  it('reads shortTitle where there is one, and falls back to title', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../ReviewScreen.tsx', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('step.shortTitle ?? step.title');
  });

  /**
   * Only the CAPTION is shortened. The position header a voter votes under, and
   * the edit button's accessible name, both still say the whole thing.
   */
  it('does not shorten the position anywhere a voter reads or hears it in full', () => {
    const review = readFileSync(
      fileURLToPath(new URL('../ReviewScreen.tsx', import.meta.url)),
      'utf8',
    );
    expect(review).toContain('aria-label={`Change your pick for ${step.title}`}');

    const position = readFileSync(
      fileURLToPath(new URL('../PositionScreen.tsx', import.meta.url)),
      'utf8',
    );
    expect(position).toContain('{step.title}');
    expect(position).not.toContain('shortTitle');
  });
});
