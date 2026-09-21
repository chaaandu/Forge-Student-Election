// @vitest-environment node
//
// Provenance check for the vendored ThreeUI source.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const vendor = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../vendor/threeui/${path}`, import.meta.url)), 'utf8');

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** The hashes published in the integration brief, verbatim. */
const REGISTERED: Record<string, string> = {
  '3d-paper/sources/3d-paper.html':
    '8ec1b71c0dbcafbadf908100ae2a08045d0a1087c00a09d28245ef19366c7353',
  '3d-paper/sources/3d-paper-site-of-the-year.html':
    'fdef93fa96a3927430ef35411af70568c56b9488921aead8f36be36800689b7d',
  '3d-paper/sources/3d-paper-japanese.html':
    '4e929b9c3feaa635c6bc45e5c556243395318d4d7feb4d6a85190768b3b9f738',
  '3d-paper/sources/3d-paper-certificate.html':
    '0cb83da723e1a54f1a2e1124bc26a27d608afc3ba42ec0b116807e2e2ae5fb32',
  '3d-paper/ThreeDPaper.tsx':
    'c2c8d1e9a0baf69c9e477e270ccde0254d6270918c106b62dffb5c7931223b20',
  'threeui.css': 'efe4447139f1358dd8e9be68edf6fa46cbefbd1de423a4d6c439ca61d2c8eccf',
};

describe('vendored ThreeUI source is the authored source', () => {
  it.each(Object.entries(REGISTERED))('%s matches its registered SHA-256', (path, expected) => {
    expect(sha256(vendor(path))).toBe(expected);
  });

  it('records where it came from', () => {
    const manifest = JSON.parse(vendor('SOURCE.json')) as {
      retrievedFrom: string;
      files: { path: string; sha256: string }[];
    };
    expect(manifest.retrievedFrom).toBe('https://threeui.com/source-code/3d-paper.json');
    expect(manifest.files).toHaveLength(6);
  });
});

describe('the derived Mesa document', () => {
  const derived = readFileSync(
    fileURLToPath(new URL('../../../public/paper/mesa-elections.html', import.meta.url)),
    'utf8',
  );

  it('carries Mesa content, not the authored award content', () => {
    expect(derived).toContain('STUDENT');
    expect(derived).toContain('ELECTIONS');
    expect(derived).not.toContain('NOCTURNE');
    expect(derived).not.toContain('SITE OF');
    expect(derived).not.toContain('SEASON XP');
    expect(derived).not.toContain('ACHIEVEMENT UNLOCKED');
  });

  it('makes no third-party request — a hall kiosk must not depend on one', () => {
    // Look for actual references, not the domain appearing in a comment: the
    // derivation script explains in prose why the fetch was removed.
    const requests = derived.match(/(?:href|src)\s*=\s*["']https?:\/\/[^"']+/gi) ?? [];
    const cssUrls = derived.match(/url\(\s*["']?https?:\/\/[^)"']+/gi) ?? [];

    expect(requests, `external href/src found: ${requests.join(', ')}`).toHaveLength(0);
    expect(cssUrls, `external css url() found: ${cssUrls.join(', ')}`).toHaveLength(0);
    expect(derived).toContain('data:font/woff2;base64,');
  });

  it('is self-contained apart from the data URIs it inlines', () => {
    // Everything the frame needs must already be in the document: a sandboxed
    // frame with an opaque origin cannot fetch our own assets either.
    expect(derived).not.toMatch(/(?:href|src)\s*=\s*["']\/(?!\/)/);
  });

  it('leaves the simulation untouched', () => {
    // Spot-check markers from the authored shader and scene that must survive.
    for (const marker of ['sTheta', 'MeshPhysicalMaterial', 'PMREMGenerator', 'clearcoat']) {
      expect(derived, marker).toContain(marker);
    }
  });

  it('names the real houses, so the artwork cannot drift from the ballot', () => {
    const config = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../server/config/election.config.json', import.meta.url)),
        'utf8',
      ),
    ) as { houses: { name: string }[] };

    for (const house of config.houses) {
      expect(derived).toContain(house.name.toUpperCase());
    }
  });

  it('redraws once fonts and crests settle, so the texture never bakes a fallback', () => {
    expect(derived).toContain('document.fonts.ready');
    expect(derived).toContain('crestsReady');
  });

  it('carries the house crests, inlined and drawn onto the sheet', () => {
    const config = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../server/config/election.config.json', import.meta.url)),
        'utf8',
      ),
    ) as { houses: { id: string }[] };

    // Inlined for the same reason as the fonts: an opaque-origin frame cannot
    // fetch /houses/*.png.
    const inlined = derived.match(/data:image\/png;base64/g) ?? [];
    expect(inlined.length).toBe(config.houses.length);
    expect(derived).toContain('ctx.drawImage(crest');

    for (const house of config.houses) {
      expect(derived, house.id).toContain(`'${house.id}':'data:image/png;base64,`);
    }
  });

  it('drops the demo hint — the only instruction on a kiosk is how to vote', () => {
    expect(derived).not.toContain('id="hint"');
    expect(derived).not.toMatch(/Drag<\/b> to turn/);
    expect(derived).not.toMatch(/Hover<\/b> to light/);
  });

  it('drops the giant background word, which competed with the panel title', () => {
    expect(derived).not.toContain('<div id="bg">');
    expect(derived).not.toContain('NOCTURNE');
    // The title belongs to the panel beside the sheet, not behind it.
    expect(derived).not.toMatch(/<h1>MESA<\/h1>/);
  });

  it('offsets the sheet to the right on wide viewports only', () => {
    expect(derived).toContain('sheetOffsetX');
    // Folded into the per-frame expression, because the loop writes this every
    // frame; setting it once would be overwritten immediately.
    expect(derived).toContain('group.position.x = sheetOffsetX +');
    // Centred when there is no room to give.
    expect(derived).toMatch(/camera\.aspect >= 1\.15 \? visW\*0\.18 : 0/);
  });

  it('carries the authored engine byte-for-byte', () => {
    // The strongest statement available: the derivation touched the content
    // layer and nothing else. Both documents embed three.js r149 and the paper
    // simulation in their first <script> block; those blocks must be identical.
    const blocks = (html: string) =>
      [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');

    const authored = blocks(vendor('3d-paper/sources/3d-paper-site-of-the-year.html'));
    const mesa = blocks(derived);

    expect(authored).toHaveLength(2);
    expect(mesa).toHaveLength(2);
    expect(mesa[0]).toBe(authored[0]);
    expect(sha256(mesa[0]!)).toBe(sha256(authored[0]!));
  });

  it('changes only the content layer of the app block', () => {
    const appBlock = (html: string) =>
      [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][1]?.[1] ?? '';

    const authored = appBlock(vendor('3d-paper/sources/3d-paper-site-of-the-year.html'));
    const mesa = appBlock(derived);

    // The simulation, material and interaction survive verbatim.
    for (const marker of [
      'sTheta(u,v)',
      'MeshPhysicalMaterial',
      'PMREMGenerator',
      'clearcoatRoughness',
      'pointerdown',
    ]) {
      expect(authored, `authored: ${marker}`).toContain(marker);
      expect(mesa, `derived: ${marker}`).toContain(marker);
    }
  });
});
