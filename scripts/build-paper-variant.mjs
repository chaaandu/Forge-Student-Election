#!/usr/bin/env node
/**
 * Derive the Mesa welcome-screen paper from the authored ThreeUI source.
 *
 * WHY A DERIVATION AND NOT A RECREATION
 * The integration brief is explicit: do not rebuild the component from its
 * preview. So nothing here is eyeballed. This script starts from the registered
 * source file, verifies it byte-for-byte against the SHA-256 published in the
 * brief, and then applies a small, enumerated set of replacements to the
 * CONTENT LAYER ONLY.
 *
 * Untouched: the vertex/fragment shaders, the paper simulation, the lighting
 * and environment, the camera, the drag/hover interaction, the grain, the
 * responsive behaviour, and the three.js r149 bundle.
 *
 * Changed, and why:
 *   1. Title              — it is a Mesa page, not a ThreeUI demo page.
 *   2. Fonts              — the authored file fetches Google Fonts at runtime.
 *                           A hall kiosk on flaky wifi must not depend on a
 *                           third-party request mid-election. They are inlined
 *                           as data URIs rather than merely self-hosted,
 *                           because the frame is sandboxed without
 *                           `allow-same-origin`: it therefore has an opaque
 *                           origin, and a same-origin font file would be
 *                           refused by CORS. Inlining removes the request, the
 *                           CORS question and the failure mode together, and
 *                           lets the sandbox stay tight.
 *   3. Background word    — NOCTURNE → MESA.
 *   4. Accent constants   — the lime/cyan pair → the Mesa yellow and a blue
 *                           lifted for legibility on the dark sheet.
 *   5. drawGame()         — the certificate content. The authored variant reads
 *                           "SITE OF THE YEAR / NOCTURNE STUDIO / SEASON XP",
 *                           which is a design award for a fictional studio. All
 *                           helper functions it uses are left exactly as
 *                           authored.
 *   6. Hint copy removed — "Drag to turn it / Hover to light it" is a demo
 *                           affordance. On a voting kiosk the only instruction
 *                           on screen should be how to vote.
 *   7. House crests       — inlined as data URIs and drawn onto the sheet, so
 *                           the ballot carries the real house shields. Inlined
 *                           for the same reason as the fonts: the frame is
 *                           sandboxed with an opaque origin and cannot fetch
 *                           /houses/*.png.
 *   8. Async retexture    — the authored file builds the CanvasTexture
 *                           synchronously, so a late webfont bakes the fallback
 *                           in permanently. We redraw once fonts AND crests
 *                           have settled.
 *
 * House names and colours are read from the live election configuration, so the
 * artwork cannot drift from the ballot.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Inline a font file as a data URI, so the frame makes no network request. */
function dataUri(path) {
  return `data:font/woff2;base64,${readFileSync(path).toString('base64')}`;
}

/**
 * Inline a crest, downscaled first.
 *
 * Same reason as the fonts: an opaque-origin frame cannot fetch our files. But
 * a crest is drawn about 68 px tall on the sheet, so inlining the display PNG
 * would put four oversampled images into the document for nothing.
 */
const scratch = mkdtempSync(join(tmpdir(), 'mesa-crest-'));
const CREST_INLINE_WIDTH = 160;

function crestUri(path) {
  if (path.endsWith('.svg')) {
    return `data:image/svg+xml;base64,${readFileSync(path).toString('base64')}`;
  }
  const small = join(scratch, path.split('/').pop());
  execFileSync('python3', [
    'scripts/optimise-crest.py',
    path,
    small,
    String(CREST_INLINE_WIDTH),
    '32',
  ]);
  return `data:image/png;base64,${readFileSync(small).toString('base64')}`;
}

const AUTHORED = 'apps/web/vendor/threeui/3d-paper/sources/3d-paper-site-of-the-year.html';
const EXPECTED_SHA = 'fdef93fa96a3927430ef35411af70568c56b9488921aead8f36be36800689b7d';
const OUT = 'apps/web/public/paper/mesa-elections.html';

const source = readFileSync(AUTHORED, 'utf8');
const actual = createHash('sha256').update(source, 'utf8').digest('hex');
if (actual !== EXPECTED_SHA) {
  console.error(
    `\n✗ ${AUTHORED} does not match the registered source.\n` +
      `  expected ${EXPECTED_SHA}\n  actual   ${actual}\n\n` +
      `  Re-fetch https://threeui.com/source-code/3d-paper.json before deriving.\n`,
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync('apps/server/config/election.config.json', 'utf8'));

/** Lift a colour toward white so it reads on the dark translucent sheet. */
function lift(hex, amount) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const houses = config.houses.map((h) => {
  const file = h.crestUrl ? `apps/web/public${h.crestUrl}` : null;
  return {
    id: h.id,
    name: h.name.toUpperCase(),
    shape: h.shape ?? 'square',
    colour: lift(h.color, 0.22),
    crest: file && existsSync(file) ? crestUri(file) : null,
  };
});

const positions = config.positions.length;
const candidates = config.candidates.filter((c) => c.active).length;

let out = source;
const replacements = [];

function replace(label, find, into) {
  if (!out.includes(find)) {
    console.error(`\n✗ patch "${label}" did not match the authored source.\n`);
    process.exit(1);
  }
  out = out.replace(find, into);
  replacements.push(label);
}

// 1 ── title
replace(
  'title',
  '<title>3D Paper — Site of the Year</title>',
  `<title>${config.election.name}</title>`,
);

// 2 ── self-hosted fonts, replacing the runtime Google Fonts request
const googleFonts = out.slice(out.indexOf('<link rel="preconnect"'), out.indexOf('<style>'));
replace(
  'fonts',
  googleFonts,
  `<style>
/* Inlined, not merely self-hosted. The authored source fetches these from
   fonts.googleapis.com; this frame is sandboxed without allow-same-origin, so
   it has an opaque origin and a same-origin font file would be refused by CORS.
   A data URI needs no request at all — nothing for a hall's wifi to drop. */
@font-face{font-family:'Inter';src:url('${dataUri('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}') format('woff2-variations');font-weight:100 900;font-display:block}
@font-face{font-family:'Inter Tight';src:url('${dataUri('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}') format('woff2-variations');font-weight:100 900;font-display:block}
@font-face{font-family:'JetBrains Mono';src:url('${dataUri('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2')}') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'JetBrains Mono';src:url('${dataUri('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2')}') format('woff2');font-weight:700;font-display:block}
</style>
`,
);

// 3 ── background word
replace('background word', '<div id="bg"><h1>NOCTURNE</h1></div>', '<div id="bg"><h1>MESA</h1></div>');
replace('background word tint', 'color:rgba(206,242,168,.115);', 'color:rgba(255,194,14,.10);');

// 4 ── remove the demo hint. On a kiosk the only instruction should be how to
//      vote, and that lives on the panel beside the sheet.
replace(
  'hint removed',
  '<div id="hint"><b>Drag</b> to turn it<span class="ptr"> &nbsp;·&nbsp; <b>Hover</b> to light it</span></div>\n',
  '',
);

// 5 ── accent constants
replace('accents', "const LIME='#B8FF3C', CYAN='#45E0FF';", "const LIME='#FFC20E', CYAN='#7FB2FF';");

// 6 ── the content layer
const drawStart = out.indexOf('function drawGame(ctx){');
const drawEnd = out.indexOf('function makeCertTexture(){');
if (drawStart < 0 || drawEnd < 0 || drawEnd < drawStart) {
  console.error('\n✗ could not locate drawGame() in the authored source.\n');
  process.exit(1);
}

const houseRows = houses
  .map((h) => `['${h.id}','${h.name}','${h.colour}','${h.shape}']`)
  .join(',');

/**
 * Crests, inlined and preloaded.
 *
 * The authored file builds its texture synchronously, so the first draw uses
 * the elementary forms; the redraw below swaps in the shields once they decode.
 */
const crestScript = `
const CRESTS = {${houses
  .filter((h) => h.crest)
  .map((h) => `'${h.id}':'${h.crest}'`)
  .join(',\n  ')}};
const CREST_IMG = {};
const crestsReady = Promise.all(Object.keys(CRESTS).map(function(k){
  return new Promise(function(res){
    var im = new Image();
    im.onload = function(){ CREST_IMG[k] = im; res(); };
    im.onerror = function(){ res(); };
    im.src = CRESTS[k];
  });
}));
`;

const drawMesa = `function drawGame(ctx){
  const g=ctx.createLinearGradient(0,0,TW,TH);
  g.addColorStop(0,'#0A121F'); g.addColorStop(0.55,'#080C14'); g.addColorStop(1,'#141020');
  ctx.fillStyle=g; ctx.fillRect(0,0,TW,TH);

  const glow=ctx.createRadialGradient(940,340,0,940,340,620);
  glow.addColorStop(0,'rgba(255,194,14,.13)'); glow.addColorStop(1,'rgba(255,194,14,0)');
  ctx.fillStyle=glow; ctx.fillRect(0,0,TW,TH);

  ctx.strokeStyle='rgba(160,190,255,.05)'; ctx.lineWidth=1;
  for(let x=80;x<TW;x+=40){ ctx.beginPath(); ctx.moveTo(x,80); ctx.lineTo(x,TH-80); ctx.stroke(); }
  for(let y=80;y<TH;y+=40){ ctx.beginPath(); ctx.moveTo(80,y); ctx.lineTo(TW-80,y); ctx.stroke(); }

  ctx.strokeStyle=LIME; ctx.lineWidth=4;
  [[70,70,1,1],[TW-70,70,-1,1],[TW-70,TH-70,-1,-1],[70,TH-70,1,-1]].forEach(([x,y,sx,sy])=>{
    ctx.beginPath(); ctx.moveTo(x+52*sx,y); ctx.lineTo(x,y); ctx.lineTo(x,y+52*sy); ctx.stroke();
  });

  ctx.fillStyle=LIME; ctx.font='700 26px '+MONO;
  ctx.beginPath(); ctx.moveTo(120,166); ctx.lineTo(140,178); ctx.lineTo(120,190); ctx.closePath(); ctx.fill();
  track(ctx,'MESA SCHOOL OF BUSINESS',156,188,5,false);
  ctx.strokeStyle='rgba(255,194,14,.34)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(120,222); ctx.lineTo(TW-120,222); ctx.stroke();

  // cohort hexagon
  ctx.save(); ctx.translate(986,392);
  ctx.beginPath();
  for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3;
    ctx[i?'lineTo':'moveTo'](Math.cos(a)*112,Math.sin(a)*112); }
  ctx.closePath();
  ctx.fillStyle='rgba(255,194,14,.10)'; ctx.fill();
  ctx.strokeStyle=LIME; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle=LIME; ctx.font='700 88px "Inter Tight", Inter, sans-serif';
  mid(ctx,'C27',32,0);
  ctx.font='700 16px '+MONO; ctx.fillStyle='rgba(255,194,14,.72)';
  track(ctx,'FORGE',0,-52,4,true);
  ctx.restore();

  ctx.fillStyle='#F3F7EE'; ctx.font='600 104px "Inter Tight", Inter, sans-serif';
  ctx.fillText('STUDENT',120,560);
  ctx.fillStyle=LIME; ctx.fillText('ELECTIONS',120,668);
  ctx.fillStyle=CYAN; ctx.font='700 28px '+MONO;
  track(ctx,'ONE VOTER · ONE BALLOT',120,724,4,false);

  ctx.fillStyle='rgba(243,247,238,.52)'; ctx.font='400 20px '+MONO;
  ctx.fillText('ON THE BALLOT',120,838);
  ctx.fillStyle=LIME;
  const stat='${positions} POSITIONS · ${candidates} CANDIDATES';
  ctx.fillText(stat, TW-120-ctx.measureText(stat).width, 838);
  ctx.fillStyle='rgba(243,247,238,.10)'; rr(ctx,120,860,TW-240,10,5); ctx.fill();
  const bar=ctx.createLinearGradient(120,0,TW-120,0);
  bar.addColorStop(0,LIME); bar.addColorStop(1,CYAN);
  ctx.fillStyle=bar; rr(ctx,120,860,TW-240,10,5); ctx.fill();

  // houses — colour and elementary form, matching the ballot
  const houses=[${houseRows}];
  houses.forEach(([id,name,col,form],i)=>{
    const y=980+i*84;
    // The real shield once it has decoded; the elementary form until then.
    const crest = CREST_IMG[id];
    if (crest) {
      const ch2=68, cw=ch2*(crest.width/crest.height);
      ctx.drawImage(crest, 140-cw/2, y-ch2*0.62, cw, ch2);
    } else {
      ctx.save(); ctx.translate(140,y-8); ctx.fillStyle=col;
      if(form==='circle'){ ctx.beginPath(); ctx.arc(0,0,20,0,7); ctx.fill(); }
      else if(form==='triangle'){ ctx.beginPath(); ctx.moveTo(0,-21); ctx.lineTo(20,18); ctx.lineTo(-20,18); ctx.closePath(); ctx.fill(); }
      else if(form==='arc'){ ctx.beginPath(); ctx.arc(0,14,21,Math.PI,0); ctx.closePath(); ctx.fill(); }
      else { ctx.fillRect(-19,-19,38,38); }
      ctx.restore();
    }
    ctx.fillStyle='rgba(243,247,238,.82)'; ctx.font='400 22px '+MONO;
    ctx.fillText(name,196,y);
    ctx.fillStyle='rgba(243,247,238,.08)'; rr(ctx,470,y-13,TW-600,16,8); ctx.fill();
    ctx.fillStyle=col; rr(ctx,470,y-13,TW-600,16,8); ctx.fill();
  });

  ctx.strokeStyle='rgba(243,247,238,.12)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(120,1330); ctx.lineTo(TW-120,1330); ctx.stroke();

  ctx.fillStyle=LIME; ctx.font='700 26px '+MONO; track(ctx,'MESA.ELECTIONS',120,1386,4,false);
  ctx.fillStyle='rgba(243,247,238,.46)'; ctx.font='400 20px '+MONO;
  ctx.fillText('STUDENTS 75%  //  EMPLOYEES 25%',120,1428);

  for(let i=0;i<${positions};i++){
    ctx.fillStyle='rgba(255,194,14,.85)';
    ctx.fillRect(120+i*30,1474,18,18);
  }
  ctx.fillStyle='rgba(243,247,238,.40)'; ctx.font='400 20px '+MONO;
  const d='FORGE C27'; ctx.fillText(d, TW-120-ctx.measureText(d).width, 1490);
}

`;

out = out.slice(0, drawStart) + crestScript + '\n' + drawMesa + out.slice(drawEnd);
replacements.push('drawGame');

// 7 ── redraw once webfonts settle, so the texture never bakes the fallback
replace(
  'async retexture',
  `  transparent: true, alphaTest: 0.42, opacity: 1
});`,
  `  transparent: true, alphaTest: 0.42, opacity: 1
});
// The texture above is built synchronously, so a webfont — or a crest — that
// arrives a moment later would be baked out of it permanently. Redraw once both
// have settled.
Promise.all([
  (document.fonts && document.fonts.ready) || Promise.resolve(),
  crestsReady
]).then(function(){
  var fresh = makeCertTexture();
  var old = mat.map;
  mat.map = fresh; mat.needsUpdate = true;
  if (old && old.dispose) old.dispose();
}).catch(function(){});`,
);

writeFileSync(OUT, out);

const bytes = Buffer.byteLength(out, 'utf8');
console.log(`✓ ${OUT}  (${(bytes / 1024).toFixed(0)} KB)`);
console.log(`  derived from ${AUTHORED}`);
console.log(`  source sha256 verified: ${EXPECTED_SHA.slice(0, 16)}…`);
console.log(`  patches applied: ${replacements.join(', ')}`);
console.log(`  houses: ${houses.map((h) => `${h.name}(${h.shape})`).join(' ')}`);
