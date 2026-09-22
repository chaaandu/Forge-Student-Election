#!/usr/bin/env node
/**
 * Derive the Forge speeches slide from the authored ThreeUI "Washi Noren".
 *
 * WHY A DERIVATION AND NOT A RECREATION
 * The integration brief is explicit: build from the registered source, not from
 * the preview. So nothing here is eyeballed. This script starts from the
 * vendored variant source, verifies it byte-for-byte against the SHA-256
 * published in the brief, and applies a small, enumerated set of replacements
 * to the CONTENT LAYER ONLY.
 *
 * Untouched: the Verlet cloth, the slit panels and their independent sway, the
 * wind model, the deckle edge and its alpha mask, the laid and chain lines as
 * MARKS, the kozo fibres, the katazome frames, the rod and cords, the camera
 * fit, and the reduced-motion path. Every geometry, simulation and timing
 * number in the authored file survives verbatim.
 *
 * Recoloured (patch 8): the vat, the vat clouding, the screen lines, the
 * fibres, the printed cream, the material tint, the lighting rig and the shoji.
 * Colour is the one layer this file changes wholesale, and it says so rather
 * than claiming an untouched lighting rig it no longer has.
 *
 * Changed, and why:
 *   1. Title      — it is a Mesa slide, not a ThreeUI demo page.
 *   2. three.js   — the authored file pulls r160 from cdn.jsdelivr.net at
 *                   runtime. A hall projector on school wifi must not depend on
 *                   a third-party request, and the frame is sandboxed without
 *                   `allow-same-origin`, so it has an opaque origin and could
 *                   not fetch our own copy either. The bundle is inlined
 *                   instead — and it is provably the same engine: the file npm
 *                   installs for three@0.160.0 is byte-identical to the one
 *                   jsdelivr serves from that URL, which this script asserts.
 *   3. Sleeve     — the uncut band above the rule carries the cohort,
 *                   "FORGE STUDENTS". The authored cloth prints nothing there.
 *                   Set in the same Georgia the panels use, tracked out so it
 *                   holds at projector distance.
 *   4. Panels     — "WOVEN" / "CLOTH" are the component's own wordmark. They
 *                   become "ELECTION" / "SPEECHES". Both are eight letters, so
 *                   the two panels stay symmetrical; the type is stepped down
 *                   from the authored 96/116 to 68/82 and re-centred in the
 *                   katazome frame so eight glyphs fit where five did.
 *   5. Crest      — the authored checkerboard mon is replaced by the school's
 *                   mark. The authored RING around it is kept: it is what makes
 *                   the centre panel read as a crest rather than a sticker.
 *
 *                   The mark is used as a STENCIL, not stamped on as an image.
 *                   The PNG is dark ink on white; everything else printed on
 *                   this cloth is the resist-dyed Lavender Mist, and a white
 *                   tile in the middle of a dyed noren would read as a mistake.
 *                   Its darkness becomes that tint instead, which is what
 *                   katazome actually does to a sheet.
 *
 *                   Inlined as a data URI for the same reason as three.js: an
 *                   opaque-origin frame cannot fetch /favicon-192x192.png.
 *   6. Seal       — the authored cloth stamps a vermilion hanko at the foot of
 *                   the centre panel. Removed: it is the component's own mark,
 *                   it reads as a second logo under the school's, and a red
 *                   block is the only thing on the cloth that competes with the
 *                   crest for a room looking at it from the back.
 *   7. Retexture  — the authored file builds its CanvasTexture synchronously.
 *                   An image decode is not synchronous, so the mark is printed
 *                   on the already-live cloth canvas and the texture is flagged
 *                   for re-upload. Without this the centre panel stays empty.
 *
 *   8. Palette    — the authored cloth is indigo under a paper lantern. Mesa
 *                   Forge is purple, and a projected wall is the largest thing
 *                   in the hall carrying the brand, so it is dyed in the Forge
 *                   core palette instead.
 *
 *                   This is a re-dye, not a filter. The component exposes a
 *                   `hue` prop that hue-rotates the whole frame in CSS, which
 *                   is one line and wrong: `hue-rotate` is a linear matrix
 *                   approximation applied to everything, so it takes the timber
 *                   rod with it and lands the cloth somewhere near the target
 *                   rather than on it. Each surface is given its own value.
 *
 *                   The lighting had to move with it. The authored rig is a
 *                   warm paper lantern behind the cloth — amber light through a
 *                   purple sheet is brown, so the lantern, the key, the fill,
 *                   the ambient and the shoji glow are all re-tinted. The
 *                   material's blue attenuation and sheen go for the same
 *                   reason: a violet cloth read through a blue tint is muddy.
 *
 *                   The rod and cords stay timber. The palette has no brown,
 *                   and they are the only warm thing left — without them the
 *                   frame is monochrome and the noren stops reading as an
 *                   object hanging in a room.
 *
 * The slide's wording is derived from the live election configuration where it
 * can be, so the artwork cannot drift from the ballot.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Find three's UMD bundle wherever npm decided to put it.
 *
 * Two reasons this is a lookup and not a constant. npm hoists to the root
 * `node_modules` only when nothing conflicts; with the version pinned exactly
 * it installs under `apps/web/node_modules` instead, so a hardcoded root path
 * is a build that works on the machine it was written on and nowhere else. And
 * `require.resolve` cannot help: three's `exports` map does not expose
 * `./build/*`, so asking Node for the file throws ERR_PACKAGE_PATH_NOT_EXPORTED
 * — the bundle is a published artefact, not a module entry point.
 */
function findThreeBundle() {
  const candidates = [
    '../apps/web/node_modules/three/build/three.min.js',
    '../node_modules/three/build/three.min.js',
  ].map((path) => fileURLToPath(new URL(path, import.meta.url)));

  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    console.error(
      `\n✗ three's UMD bundle is not installed.\n` +
        candidates.map((path) => `  looked in ${path}\n`).join('') +
        `\n  Run \`npm install\` at the repository root.\n`,
    );
    process.exit(1);
  }
  return found;
}

const AUTHORED = 'apps/web/vendor/threeui/woven-cloth/sources/woven-cloth-washi.html';
const EXPECTED_SHA = '00e5971f139e5427e56a062c12d7e8e3590938b9a400753693b360d1e4d1a5c1';

/**
 * The exact bundle the authored <script src> resolves to on jsdelivr.
 *
 * `three` is pinned to 0.160.0 exactly, not `^0.160.0`: the hash below is of
 * that release's file, and a patch release would fail the assertion. The pin
 * states the real constraint instead of leaving it to be discovered on CI.
 */
const THREE_BUNDLE = findThreeBundle();
const THREE_SHA = '170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';

/** The school's mark, as shipped for the favicon. */
const MARK = 'apps/web/public/favicon-192x192.png';

/**
 * The Mesa Forge core palette, verbatim from the brand book.
 *
 * Named here rather than inlined at each call site so the cloth can be read
 * against the brand sheet without decoding hexes, and so a palette revision is
 * one edit. The roles are the brand book's own: INK is "light page background",
 * used here for everything the resist leaves undyed, and ORCHID is named for
 * the ring motif, which is exactly what it is on this cloth.
 */
const FORGE = {
  aubergine: '#2A1849',
  royal: '#452A74',
  amethyst: '#5A3A8E',
  violet: '#7C4DCC',
  orchid: '#E4A7F3',
  ink: '#F5EDFB',
  black: '#1D1C1D',
};

/** The undyed tint as RGB, for the stencil's per-pixel path. */
const INK_RGB = [245, 237, 251];

const OUT = 'apps/web/public/noren/forge-speeches.html';

function verify(path, expected, hint) {
  const value = readFileSync(path);
  const actual = createHash('sha256').update(value).digest('hex');
  if (actual !== expected) {
    console.error(
      `\n✗ ${path} does not match its registered hash.\n` +
        `  expected ${expected}\n  actual   ${actual}\n\n  ${hint}\n`,
    );
    process.exit(1);
  }
  return value;
}

const source = verify(
  AUTHORED,
  EXPECTED_SHA,
  'Re-fetch https://threeui.com/source-code/woven-cloth.json before deriving.',
).toString('utf8');

const three = verify(
  THREE_BUNDLE,
  THREE_SHA,
  `The authored document loads ${THREE_CDN}. Inlining anything else would change the engine.`,
).toString('utf8');

// Inlined verbatim, so it must not close its own tag. The r160 bundle does not
// contain the sequence; assert it rather than assume it.
if (three.includes('</script')) {
  console.error('\n✗ the three.js bundle contains "</script" and cannot be inlined verbatim.\n');
  process.exit(1);
}

const config = JSON.parse(readFileSync('apps/server/config/election.config.json', 'utf8'));
const markUri = `data:image/png;base64,${readFileSync(MARK).toString('base64')}`;

let out = source;
const applied = [];

function replace(label, find, into) {
  if (!out.includes(find)) {
    console.error(`\n✗ patch "${label}" did not match the authored source.\n`);
    process.exit(1);
  }
  // A FUNCTION replacer, not the string. `String.replace` reads `$&`, `` $` ``,
  // `$'` and `$n` out of a string replacement, and the minified three.js bundle
  // contains `$&` — which quietly spliced the <script src> tag it was meant to
  // remove back into the middle of the engine. A replacer function is passed
  // through verbatim.
  out = out.replace(find, () => into);
  applied.push(label);
}

// 1 ── title
replace(
  'title',
  '<title>Woven Cloth · Washi Noren</title>',
  `<title>${config.election.name} — Speeches</title>`,
);

// 2 ── the engine, inlined rather than fetched
replace(
  'three.js inlined',
  `<script src="${THREE_CDN}"></script>`,
  `<!-- three.js r160, byte-for-byte the bundle the authored document loads from
     ${THREE_CDN}
     Inlined, not merely self-hosted: this frame is sandboxed without
     allow-same-origin, so it has an opaque origin and a same-origin script
     would be refused. A hall projector then needs no network at all. -->
<script>
${three}
</script>`,
);

// 3 ── a horizontal setting, for the sleeve. The authored file only ever sets
//      type down a panel, so there is no helper for this; it is written in the
//      same shape as `verticalWord` and tracks the letters out by hand, because
//      ctx.letterSpacing is not carried everywhere.
replace(
  'horizontalWord helper',
  `  function makeClothCanvas() {`,
  `  function horizontalWord(x, word, cx, cy, size, track) {
    x.font = 'bold ' + size + 'px Georgia, "Times New Roman", serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const widths = [];
    let total = track * (word.length - 1);
    for (let i = 0; i < word.length; i++) {
      widths.push(x.measureText(word[i]).width);
      total += widths[i];
    }
    let px = cx - total / 2;
    for (let i = 0; i < word.length; i++) {
      x.fillText(word[i], px + widths[i] / 2, cy);
      px += widths[i] + track;
    }
  }

  function makeClothCanvas() {`,
);

// 4 + 5 ── the crest. The checkerboard goes; the ring stays, and the school's
//          mark is stencilled inside it.
replace(
  'crest — mark replaces the checkerboard, ring kept',
  `  function drawWeaveCrest(x, cx, cy, R) {
    const cells = 6, step = (R * 1.86) / cells, origin = -R * 0.93;
    x.save();
    x.beginPath(); x.arc(cx, cy, R * 0.86, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#f3ece0';
    for (let a = 0; a < cells; a++) {
      for (let b = 0; b < cells; b++) {
        if ((a + b) % 2) continue;
        x.fillRect(cx + origin + a * step, cy + origin + b * step, step + 0.5, step + 0.5);
      }
    }
    x.restore();
    x.strokeStyle = '#f3ece0';
    x.lineWidth = R * 0.10;
    x.beginPath(); x.arc(cx, cy, R * 0.96, 0, Math.PI * 2); x.stroke();
  }`,
  `  const CREST = { cx: (TW / PANELS) * 1.5, cy: TH * 0.53, R: 158 };
  const MARK_URI = '${markUri}';

  // The authored ring, kept exactly: it is what makes the centre panel read as
  // a crest. Only what sits inside it has changed.
  function drawCrestRing(x, cx, cy, R) {
    x.strokeStyle = '${FORGE.orchid}';
    x.lineWidth = R * 0.10;
    x.beginPath(); x.arc(cx, cy, R * 0.96, 0, Math.PI * 2); x.stroke();
  }

  /* Katazome leaves the cloth's own pigment behind the resist, so the mark is
     taken as a stencil rather than stamped on: the PNG's darkness becomes the
     same ${FORGE.ink} as the frames and the lettering, and its white ground
     falls away. Rendered at 384 and drawn down, so the edges stay clean at the
     size the crest is actually printed. */
  function stencil(img, size, ink) {
    const s = surface(size, size);
    s.ctx.drawImage(img, 0, 0, size, size);
    const image = s.ctx.getImageData(0, 0, size, size), p = image.data;
    for (let i = 0; i < p.length; i += 4) {
      const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
      p[i] = ink[0]; p[i + 1] = ink[1]; p[i + 2] = ink[2];
      p[i + 3] = Math.round((p[i + 3] / 255) * (1 - lum) * 255);
    }
    s.ctx.putImageData(image, 0, 0);
    return s.canvas;
  }

  /* An image decode is not synchronous, and the authored file builds its
     CanvasTexture in one pass. So the mark is printed onto the live cloth
     canvas afterwards and the caller re-uploads the texture. */
  function printMark(ctx, done) {
    const img = new Image();
    img.onload = () => {
      const size = CREST.R * 1.62;
      ctx.drawImage(
        stencil(img, 384, [${INK_RGB.join(', ')}]),
        CREST.cx - size / 2, CREST.cy - size / 2, size, size,
      );
      done();
    };
    img.src = MARK_URI;
  }`,
);

// 3 + 4 ── what the cloth says
replace(
  'cloth wording',
  `    x.fillStyle = '#f3ece0';
    verticalWord(x, 'WOVEN', panelW * 0.5, TH * 0.34, 96, 116);
    drawWeaveCrest(x, panelW * 1.5, TH * 0.53, 158);
    verticalWord(x, 'CLOTH', panelW * 2.5, TH * 0.34, 96, 116);`,
  `    x.fillStyle = '${FORGE.ink}';
    // The sleeve is the one band the slits never reach, so it is the only place
    // on this cloth a line can run the whole way across.
    horizontalWord(x, 'FORGE STUDENTS', TW * 0.5, TH * BAND * 0.60, 62, 14);
    // Eight glyphs where the authored wordmark had five: stepped down and
    // re-centred on the katazome frame, which runs TH*BAND+47 to TH-144.
    verticalWord(x, 'ELECTION', panelW * 0.5, TH * 0.256, 68, 82);
    drawCrestRing(x, CREST.cx, CREST.cy, CREST.R);
    verticalWord(x, 'SPEECHES', panelW * 2.5, TH * 0.256, 68, 82);`,
);

// 6 ── the vermilion seal. The authored hanko is the component's own mark, and
//      under the school's crest it reads as a second logo on the same panel.
replace(
  'seal removed',
  `
    // Vermilion seal, stamped at the foot of the centre panel.
    const S = 96, sx = panelW * 1.5 - S / 2, sy = TH * 0.828;
    x.fillStyle = '#a8342a';
    x.fillRect(sx, sy, S, S);
    x.strokeStyle = '#f3ece0';
    x.lineWidth = 4;
    x.strokeRect(sx + 11, sy + 11, S - 22, S - 22);
    x.fillStyle = '#f3ece0';
    for (let k = 0; k < 3; k++) x.fillRect(sx + 23 + k * 18, sy + 23, 8, S - 46);
    x.fillRect(sx + 23, sy + 38, S - 46, 8);
    x.fillRect(sx + 23, sy + 60, S - 46, 8);
`,
  '',
);

// 7 ── print the mark once it has decoded, and re-upload the texture
replace(
  'async retexture',
  `  const albedo = new THREE.CanvasTexture(clothCanvas.canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;`,
  `  const albedo = new THREE.CanvasTexture(clothCanvas.canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  printMark(clothCanvas.ctx, () => { albedo.needsUpdate = true; });`,
);

// 8 ── the dye. Everything below is a colour value and nothing else: no
//      geometry, no timing, no alpha-mask or simulation number moves.

// The vat, keeping the authored logic that the cloth is deeper where it was
// dipped longest — Amethyst at the top of the dip, Aubergine at the bottom.
replace(
  'vat — Forge dip ramp',
  `    g.addColorStop(0, '#284a6c');
    g.addColorStop(0.42, '#203d5e');
    g.addColorStop(1, '#17304e');`,
  `    g.addColorStop(0, '${FORGE.amethyst}');
    g.addColorStop(0.42, '${FORGE.royal}');
    g.addColorStop(1, '${FORGE.aubergine}');`,
);

// Vat unevenness: the pale blooms are where the dye took least. Vivid Violet is
// the palette's high-energy value and it is the only one that still reads as a
// bloom at 13% over Royal Purple.
replace(
  'vat clouding',
  `      rg.addColorStop(0, light ? 'rgba(96,132,168,0.13)' : 'rgba(9,22,40,0.16)');`,
  `      rg.addColorStop(0, light ? 'rgba(124,77,204,0.13)' : 'rgba(20,10,38,0.16)');`,
);

// The bamboo screen's laid lines, then the heavier chain lines. Orchid and the
// undyed tint respectively — the same two the crest and the lettering use, so
// the sheet is made of the marks the print is made of.
replace(
  'laid lines',
  `    x.strokeStyle = 'rgba(180,205,228,0.045)';`,
  `    x.strokeStyle = 'rgba(228,167,243,0.045)';`,
);
replace(
  'chain lines',
  `    x.strokeStyle = 'rgba(196,218,238,0.10)';`,
  `    x.strokeStyle = 'rgba(245,237,251,0.10)';`,
);

// Kozo fibres, pale and dark.
replace(
  'kozo fibres',
  `      x.strokeStyle = pale > 0.3
        ? 'rgba(214,232,247,' + (0.022 + fib() * 0.048) + ')'
        : 'rgba(10,20,36,' + (0.04 + fib() * 0.07) + ')';`,
  `      x.strokeStyle = pale > 0.3
        ? 'rgba(245,237,251,' + (0.022 + fib() * 0.048) + ')'
        : 'rgba(26,12,46,' + (0.04 + fib() * 0.07) + ')';`,
);

// The katazome frames, the sleeve and its shadow, and the rule under the rod.
replace(
  'katazome frames',
  `    x.strokeStyle = 'rgba(243,236,224,0.72)';`,
  `    x.strokeStyle = 'rgba(245,237,251,0.72)';`,
);
replace(
  'sleeve and its shadow',
  `    x.fillStyle = 'rgba(8,18,34,0.30)';`,
  `    x.fillStyle = 'rgba(20,10,38,0.30)';`,
);
replace(
  'sleeve shadow gradient',
  `    sh.addColorStop(0, 'rgba(6,14,28,0.42)');
    sh.addColorStop(1, 'rgba(6,14,28,0)');`,
  `    sh.addColorStop(0, 'rgba(16,8,32,0.42)');
    sh.addColorStop(1, 'rgba(16,8,32,0)');`,
);
replace(
  'rule under the rod',
  `    x.strokeStyle = 'rgba(243,236,224,0.5)';`,
  `    x.strokeStyle = 'rgba(245,237,251,0.5)';`,
);

/* The material reads the cloth through its own tint, because the sheet is
   transmissive — the authored blue is what made indigo sit right. Left alone it
   pulls the dye grey-blue and Royal Purple lands nearer slate than purple. Only
   the two colours move; transmission, thickness, ior, roughness and the sheen
   amount are the authored values. */
replace(
  'material attenuation',
  `    attenuationColor: new THREE.Color('#9dc0dd'),`,
  `    attenuationColor: new THREE.Color('#b49ae0'),`,
);
replace(
  'material sheen',
  `    sheenColor: new THREE.Color('#d8e6f2'),`,
  `    sheenColor: new THREE.Color('#ece2f7'),`,
);

/* The rig. This is the change that actually decides whether the wall is purple:
   the authored lantern is a warm amber lamp at intensity 3.6 behind a sheet
   with transmission 0.82, and amber through violet is brown. Every intensity
   and every position is the authored number — only the colours move. */
replace(
  'lighting rig re-tinted',
  `  scene.add(new THREE.AmbientLight(0x4a3a28, 0.8));
  const lantern = new THREE.DirectionalLight(0xffd9a0, 3.6);   // through the shoji`,
  `  scene.add(new THREE.AmbientLight(0x3a2c52, 0.8));
  const lantern = new THREE.DirectionalLight(0xe8d2ff, 3.6);   // through the shoji`,
);
replace(
  'key light',
  `  const key = new THREE.DirectionalLight(0xffe9cc, 2.1);`,
  `  const key = new THREE.DirectionalLight(0xf6ecff, 2.1);`,
);
replace(
  'fill light',
  `  const fill = new THREE.DirectionalLight(0x94b6d8, 0.5);`,
  `  const fill = new THREE.DirectionalLight(0xa88ad0, 0.5);`,
);

// The shoji behind the cloth, which is what the lantern shines through.
replace(
  'shoji ground',
  `    x.fillStyle = '#1a1109'; x.fillRect(0, 0, W, H);`,
  `    x.fillStyle = '${FORGE.black}'; x.fillRect(0, 0, W, H);`,
);
replace(
  'shoji glow',
  `    glow.addColorStop(0, '#ffdda4');
    glow.addColorStop(0.40, '#a97c42');
    glow.addColorStop(0.76, '#341d0c');
    glow.addColorStop(1, '#150d06');`,
  `    glow.addColorStop(0, '${FORGE.orchid}');
    glow.addColorStop(0.40, '${FORGE.violet}');
    glow.addColorStop(0.76, '${FORGE.aubergine}');
    glow.addColorStop(1, '${FORGE.black}');`,
);
replace(
  'kumiko lattice',
  `    x.strokeStyle = 'rgba(46,28,13,0.20)';`,
  `    x.strokeStyle = 'rgba(29,28,29,0.20)';`,
);

// The room around the cloth: Ink Black, so nothing on a projector is warmer
// than the wall itself.
replace(
  'scene background',
  `  scene.background = new THREE.Color(0x0c0906);`,
  `  scene.background = new THREE.Color(0x1d1c1d);`,
);
replace('page ground', `background: #0d0a07; }`, `background: ${FORGE.black}; }`);
replace('vignette', `rgba(10,7,5,.80) 100%);`, `rgba(29,28,29,.80) 100%);`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

console.log(`✓ ${OUT}`);
for (const label of applied) console.log(`  · ${label}`);
console.log(`  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB, no external request`);
