import type { House } from '@mesa/election-core';

/**
 * Where a house's shield comes from.
 *
 * The crests are artwork that ships with the web app — four PNGs in
 * `public/houses/`, named by house id and produced by `npm run houses:import`.
 * They are not data about the election, and the ballot should not have to be
 * told where its own images live.
 *
 * It was told, and that was the bug: the API carried a `crestUrl` for each
 * house, a generator in the middle of the chain quietly stopped copying that
 * field, and every house fell back to its drawn shape. Four coloured blocks on
 * the ballot, nothing in any log, because falling back is exactly what the
 * fallback is for.
 *
 * This mirrors `candidatePhoto.ts`, which solved the same problem for
 * headshots for a different reason and arrived at the same place: pictures are
 * presentation, resolved in the layer that draws them. A configured `crestUrl`
 * still wins if one is supplied, so an election that genuinely hosts its crests
 * elsewhere is unaffected — but nothing has to supply one for the artwork in
 * this repository to appear.
 */
export function houseCrestUrl(house: Pick<House, 'id' | 'crestUrl'>): string {
  return house.crestUrl ?? `/houses/${house.id}.png`;
}
