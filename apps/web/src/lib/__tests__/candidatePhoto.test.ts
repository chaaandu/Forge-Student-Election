import { describe, expect, it } from 'vitest';
import { indexPhotos, resolvePhoto } from '../candidatePhoto';

/**
 * Photographs override placeholders in the render layer, deliberately NOT in
 * `election.config.json` — that file is hashed into `configVersion`, which is
 * stamped onto every ballot. See `candidatePhoto.ts` for the full reasoning.
 */
describe('resolving a candidate photograph', () => {
  const index = indexPhotos({
    '../assets/candidates/president--sairaj-g.jpg': '/assets/president--sairaj-g.a1b2.jpg',
    '../assets/candidates/house-captain-samurai--adnaan-r.jpg': '/assets/adnaan.c3d4.jpg',
  });

  it('keys the index by candidate id, not by path', () => {
    expect([...index.keys()]).toEqual([
      'president--sairaj-g',
      'house-captain-samurai--adnaan-r',
    ]);
  });

  it('prefers an imported photograph over the placeholder', () => {
    expect(
      resolvePhoto(index, {
        id: 'president--sairaj-g',
        photoUrl: '/candidates/president--sairaj-g.svg',
      }),
    ).toBe('/assets/president--sairaj-g.a1b2.jpg');
  });

  it('leaves a candidate with no photograph on their placeholder', () => {
    // The whole point of a partial set: photos arrive one at a time, and the
    // people still waiting must look deliberate rather than broken.
    expect(
      resolvePhoto(index, {
        id: 'president--itish-pande',
        photoUrl: '/candidates/president--itish-pande.svg',
      }),
    ).toBe('/candidates/president--itish-pande.svg');
  });

  it('resolves each candidacy separately when one person stands twice', () => {
    // Adnaan R. stands for two positions, which are two candidate ids sharing
    // one face. The import writes a file per id, so both must resolve.
    expect(resolvePhoto(index, { id: 'house-captain-samurai--adnaan-r' })).toBe(
      '/assets/adnaan.c3d4.jpg',
    );
    expect(resolvePhoto(index, { id: 'academic-lead-boy--adnaan-r' })).toBeUndefined();
  });

  it('returns nothing when there is neither photograph nor placeholder', () => {
    expect(resolvePhoto(index, { id: 'nobody' })).toBeUndefined();
  });

  it('copes with no photographs delivered at all', () => {
    expect(indexPhotos({}).size).toBe(0);
    expect(resolvePhoto(indexPhotos({}), { id: 'x', photoUrl: '/p.svg' })).toBe('/p.svg');
  });
});
