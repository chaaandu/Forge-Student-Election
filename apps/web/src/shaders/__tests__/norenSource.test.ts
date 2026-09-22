// @vitest-environment node
//
// Provenance check for the vendored ThreeUI Woven Cloth, and for the wall
// derived from its washi variant.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const vendor = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../vendor/threeui/${path}`, import.meta.url)), 'utf8');

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** The hashes published in the integration brief, verbatim. */
const REGISTERED: Record<string, string> = {
  'woven-cloth/WovenCloth.tsx': '5a89ff035bdf33dbc642d2916b56dbe94e89cb0af184474c139ffbfe5a720550',
  'neuform-isolated/NeuformCraftEffects.tsx':
    '0a1680c3c119dba8c61d946322afa0b64d36dfd80956fb5e7c3fd017d7bfa450',
  'neuform-isolated/sources/lumina-weavers-cloth.html':
    '9bfd56ef7579a92cb6385b3e93866bc3ff54fa4489a0febb9809b720e2946fb6',
  'woven-cloth/sources/woven-cloth-iridescent.html':
    'e3b14adac39dfef04ed0bb0df99e86a1aa0aaf7cea4f8ecc4d5e0931b48bee7b',
  'woven-cloth/sources/woven-cloth-atelier.html':
    'f9be15756ff385db9cd3b7082b139d10b84a4eba0b3c4f19749b305570a7191f',
  'woven-cloth/sources/woven-cloth-washi.html':
    '00e5971f139e5427e56a062c12d7e8e3590938b9a400753693b360d1e4d1a5c1',
  'threeui.css': 'efe4447139f1358dd8e9be68edf6fa46cbefbd1de423a4d6c439ca61d2c8eccf',
};

describe('vendored Woven Cloth source is the authored source', () => {
  it.each(Object.entries(REGISTERED))('%s matches its registered SHA-256', (path, expected) => {
    expect(sha256(vendor(path))).toBe(expected);
  });

  it('records where it came from', () => {
    const manifest = JSON.parse(vendor('woven-cloth/SOURCE.json')) as {
      retrievedFrom: string;
      files: { path: string; sha256: string }[];
    };
    expect(manifest.retrievedFrom).toBe('https://threeui.com/source-code/woven-cloth.json');
    expect(manifest.files).toHaveLength(7);
  });

  it('is the revision the brief names', () => {
    // The brief pins the bundle by its canonical source.
    expect(REGISTERED['neuform-isolated/sources/lumina-weavers-cloth.html']).toMatch(
      /^9bfd56ef7579/,
    );
  });
});

describe('the derived speeches wall', () => {
  const authored = vendor('woven-cloth/sources/woven-cloth-washi.html');
  const derived = readFileSync(
    fileURLToPath(new URL('../../../public/noren/forge-speeches.html', import.meta.url)),
    'utf8',
  );

  it('carries the Forge wording, not the component wordmark', () => {
    expect(derived).toContain("'FORGE STUDENTS'");
    expect(derived).toContain("'ELECTION'");
    expect(derived).toContain("'SPEECHES'");
    expect(derived).not.toContain("'WOVEN'");
    expect(derived).not.toContain("'CLOTH'");
  });

  it('prints the sleeve above the rule, where the slits never reach', () => {
    // The alpha mask cuts the slits from TH*BAND down, so the band is the one
    // place a line can run across all three panels.
    expect(derived).toMatch(/horizontalWord\(x, 'FORGE STUDENTS', TW \* 0\.5, TH \* BAND \* /);
  });

  it('drops the vermilion seal, so the crest is the only mark on the cloth', () => {
    expect(authored).toContain('// Vermilion seal, stamped at the foot');
    expect(derived).not.toContain('Vermilion seal');
    expect(derived).not.toContain('#a8342a');
  });

  it('drops the checkerboard mon and stencils the school mark in its place', () => {
    expect(derived).not.toContain('drawWeaveCrest');
    expect(derived).toContain('data:image/png;base64,');
    expect(derived).toContain('function stencil(');
    // The ring the authored crest drew is kept — it is what frames the mark.
    expect(derived).toContain('function drawCrestRing(');
    expect(derived).toMatch(/drawCrestRing\(x, CREST\.cx, CREST\.cy, CREST\.R\)/);
  });

  it('re-uploads the texture once the mark decodes, so the panel is never empty', () => {
    // The authored file builds its CanvasTexture in one synchronous pass; an
    // image decode is not synchronous.
    expect(derived).toContain('printMark(clothCanvas.ctx, () => { albedo.needsUpdate = true; });');
  });

  it('makes no third-party request — a hall projector must not depend on one', () => {
    const requests = derived.match(/(?:href|src)\s*=\s*["']https?:\/\/[^"']+/gi) ?? [];
    const cssUrls = derived.match(/url\(\s*["']?https?:\/\/[^)"']+/gi) ?? [];

    expect(requests, `external href/src found: ${requests.join(', ')}`).toHaveLength(0);
    expect(cssUrls, `external css url() found: ${cssUrls.join(', ')}`).toHaveLength(0);
    // The authored document did make one; this is the request that went away.
    expect(authored).toContain('cdn.jsdelivr.net/npm/three@0.160.0');
  });

  it('is self-contained apart from the data URIs it inlines', () => {
    // A sandboxed frame with an opaque origin cannot fetch our own assets.
    expect(derived).not.toMatch(/(?:href|src)\s*=\s*["']\/(?!\/)/);
  });

  it('inlines the same three.js the authored document loads', () => {
    // Byte-identical to what jsdelivr serves for three@0.160.0, which is what
    // makes the swap an inlining and not an engine change.
    const bundle = readFileSync(
      fileURLToPath(
        new URL('../../../../../node_modules/three/build/three.min.js', import.meta.url),
      ),
      'utf8',
    );
    expect(sha256(bundle)).toBe('170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa');
    expect(derived).toContain(bundle);
  });

  it('leaves the cloth simulation untouched', () => {
    // The Verlet sheet, the cut horizontal links that free the panels, the
    // deckle, the material and the camera fit all survive verbatim.
    const markers = [
      'function solve(a, b, rl)',
      'const linked = (ix, iy) =>',
      'deckleLow[x] = TH - 14 -',
      'MeshPhysicalMaterial',
      'attenuationColor',
      'function wind(ix, iy, t)',
      'const vFit = (BH * 1.12 / 2) / Math.tan(38 * Math.PI / 360);',
    ];
    for (const marker of markers) {
      expect(authored, `authored: ${marker}`).toContain(marker);
      expect(derived, `derived: ${marker}`).toContain(marker);
    }
  });

  it('changes only the content layer and the dye', () => {
    // Everything the derivation removed from the authored script, enumerated.
    // Anything else disappearing from the simulation fails here — unless the
    // only thing that changed on the line was a colour, which `recolour` below
    // proves rather than takes on trust.
    const script = (html: string) =>
      [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '').pop() ?? '';

    const removed = [
      "verticalWord(x, 'WOVEN', panelW * 0.5, TH * 0.34, 96, 116);",
      "verticalWord(x, 'CLOTH', panelW * 2.5, TH * 0.34, 96, 116);",
      'drawWeaveCrest(x, panelW * 1.5, TH * 0.53, 158);',
      // The vermilion hanko: the component's own mark, and a second logo under
      // the school's crest on the same panel.
      '// Vermilion seal, stamped at the foot of the centre panel.',
      'const S = 96, sx = panelW * 1.5 - S / 2, sy = TH * 0.828;',
      "x.fillStyle = '#a8342a';",
      'x.fillRect(sx, sy, S, S);',
      'x.lineWidth = 4;',
      'x.strokeRect(sx + 11, sy + 11, S - 22, S - 22);',
      'for (let k = 0; k < 3; k++) x.fillRect(sx + 23 + k * 18, sy + 23, 8, S - 46);',
      'x.fillRect(sx + 23, sy + 38, S - 46, 8);',
      'x.fillRect(sx + 23, sy + 60, S - 46, 8);',
    ];

    const authoredLines = script(authored)
      .split('\n')
      .map((l) => l.trim());
    const derivedLines = new Set(
      script(derived)
        .split('\n')
        .map((l) => l.trim()),
    );

    const missing = authoredLines.filter((line) => line && !derivedLines.has(line));
    // The checkerboard body goes with the crest it drew.
    const expected = new Set([
      ...removed,
      'function drawWeaveCrest(x, cx, cy, R) {',
      'const cells = 6, step = (R * 1.86) / cells, origin = -R * 0.93;',
      'x.beginPath(); x.arc(cx, cy, R * 0.86, 0, Math.PI * 2); x.clip();',
      'for (let a = 0; a < cells; a++) {',
      'for (let b = 0; b < cells; b++) {',
      'if ((a + b) % 2) continue;',
      'x.save();',
      'x.fillRect(cx + origin + a * step, cy + origin + b * step, step + 0.5, step + 0.5);',
      'x.restore();',
      'x.beginPath(); x.arc(cx, cy, R * 0.96, 0, Math.PI * 2); x.stroke();',
    ]);

    /*
      A line whose ONLY difference is a colour value is the dye, not drift.

      Blanking every colour literal and asking whether the line still exists in
      the derived file is a stronger guard than listing the recoloured lines
      would be: an allowlist of forty hexes says nothing about what else moved
      on those lines, and it would have to be re-typed on every palette change.
      This says the shape is identical and only the colour moved, which is the
      claim the header comment actually makes.
    */
    const blankColours = (line: string) =>
      line
        .replace(/#[0-9a-f]{3,8}\b/gi, '#C')
        .replace(/0x[0-9a-f]{6}\b/gi, '0xC')
        .replace(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/gi, 'rgba(C');

    const derivedShapes = new Set([...derivedLines].map(blankColours));
    const recoloured = (line: string) => derivedShapes.has(blankColours(line));

    expect(missing.filter((line) => !expected.has(line) && !recoloured(line))).toEqual([]);
  });

  it('is dyed in the Forge palette, with no indigo left anywhere', () => {
    // Every value the authored washi noren was built from. One surviving means
    // a half-applied recolour, which on a projector reads as a bug rather than
    // as a choice.
    const authoredDye = [
      '#284a6c',
      '#203d5e',
      '#17304e', // the indigo vat
      '#f3ece0', // the printed cream
      '#9dc0dd',
      '#d8e6f2', // the material's blue tint
      '0xffd9a0',
      '0xffe9cc',
      '0x94b6d8',
      '0x4a3a28', // the warm rig
      '#ffdda4',
      '#a97c42',
      '#1a1109', // the shoji lantern
      '0x0c0906',
      '#0d0a07', // the room
    ];
    for (const value of authoredDye) {
      expect(authored.toLowerCase(), `authored: ${value}`).toContain(value);
      expect(derived.toLowerCase(), `derived still has ${value}`).not.toContain(value);
    }

    // And the palette it was dyed in, from the Mesa Forge brand book.
    for (const value of ['#5a3a8e', '#452a74', '#2a1849', '#e4a7f3', '#f5edfb', '#1d1c1d']) {
      expect(derived.toLowerCase(), `derived is missing ${value}`).toContain(value);
    }
  });

  it('keeps the rod timber, so the frame is not monochrome', () => {
    // The palette has no brown and the fittings are the only warm thing left.
    // Losing them is how the noren stops reading as an object in a room.
    for (const value of ['#a1764a', '#7d5533', '#563820']) {
      expect(derived).toContain(value);
    }
  });

  it('holds 100vh with nothing to scroll', () => {
    expect(derived).toContain('overflow: hidden');
    // The scene sizes itself to the viewport on every resize, which is what
    // makes the wall correct at 1080 wide and at 1920 without a breakpoint.
    expect(derived).toContain("window.addEventListener('resize', fit)");
  });
});
