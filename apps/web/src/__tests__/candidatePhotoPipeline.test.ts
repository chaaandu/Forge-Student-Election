// @vitest-environment node
//
// The photo pipeline must not touch the ballot definition.
//
// `election.config.json` is hashed into `configVersion`, and that hash is
// stamped onto every ballot to record which ballot definition a vote was cast
// under. An earlier version of the import wrote `photoUrl` back into that file,
// which meant a headshot arriving mid-election changed the hash — and the audit
// trail could no longer distinguish "someone sent a photo" from "the slate of
// candidates changed", which is the one question the stamp exists to answer.
//
// Photographs are presentation. They are resolved in the web layer instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = readFileSync(
  fileURLToPath(new URL('../../../../scripts/import-candidate-photos.mjs', import.meta.url)),
  'utf8',
);

describe('the candidate photo import', () => {
  it('never writes to the election config', () => {
    expect(script, 'the import writes a file — check it is not the config').not.toMatch(
      /writeFileSync|writeFile\(|appendFileSync/,
    );
  });

  it('does not import a file-writing helper it has no reason to hold', () => {
    const fsImport = script.match(/import \{([^}]*)\} from 'node:fs'/)?.[1] ?? '';
    expect(fsImport).not.toMatch(/write/i);
  });

  it('writes photographs into the web asset graph, not public/ or the config', () => {
    // public/ would be served unhashed and uncached; the asset graph gets
    // fingerprinted, and lets `import.meta.glob` see the file without a request
    // being made for photographs that do not exist.
    expect(script).toMatch(/const OUT = 'apps\/web\/src\/assets\/candidates'/);
  });

  it('still reads the config, so it knows who is standing', () => {
    expect(script).toMatch(/readFileSync\(CONFIG/);
  });
});
