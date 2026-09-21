import type { Candidate } from '@mesa/election-core';

/**
 * Where a candidate's picture comes from.
 *
 * Photographs arrive late — often after voting has already been rehearsed —
 * so they are deliberately NOT part of `election.config.json`. That file is
 * hashed into `configVersion`, and every ballot is stamped with it to record
 * which ballot definition the vote was cast under. If adding a photograph
 * changed that hash, the audit trail could no longer distinguish "someone sent
 * a headshot" from "the slate of candidates changed", which is the one thing
 * the stamp exists to tell you.
 *
 * So the config keeps pointing at the initials placeholder for the whole
 * election, and a real photograph simply overrides it here, in the layer that
 * draws pictures. Dropping a file in is a presentation change and nothing more.
 *
 * `import.meta.glob` resolves at build time, which means:
 *   - no request is made for a photograph that does not exist, so there are no
 *     404s in the console for the candidates still on initials;
 *   - Vite fingerprints and serves each file it does find;
 *   - in development the graph updates when a file appears, so a photo shows
 *     up without restarting anything.
 */
const photos = import.meta.glob<string>('../assets/candidates/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Build the id → url index from whatever the glob found.
 *
 * Separated from the glob so it can be tested: the glob resolves real files on
 * disk at build time, and a test that depended on which photographs happen to
 * have been delivered would pass or fail based on the contents of a folder.
 */
export function indexPhotos(found: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(found).map(([path, url]) => [
      // `../assets/candidates/president--sairaj-g.jpg` → `president--sairaj-g`,
      // the filename `import-candidate-photos.mjs` writes.
      path.slice(path.lastIndexOf('/') + 1, -'.jpg'.length),
      url,
    ]),
  );
}

/**
 * The best picture available: the imported photograph if there is one,
 * otherwise the initials placeholder named by the config.
 *
 * Returns undefined only if neither exists, which the card draws as initials
 * in text rather than as a broken image.
 */
export function resolvePhoto(
  index: Map<string, string>,
  candidate: Pick<Candidate, 'id' | 'photoUrl'>,
): string | undefined {
  return index.get(candidate.id) ?? candidate.photoUrl;
}

const byId = indexPhotos(photos);

export function candidatePhoto(candidate: Pick<Candidate, 'id' | 'photoUrl'>): string | undefined {
  return resolvePhoto(byId, candidate);
}

/** How many candidates have a real photograph. Reported by the import script. */
export function importedPhotoCount(): number {
  return byId.size;
}
