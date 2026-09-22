# Vendored: ThreeUI

Two registry bundles live here: `3d-paper` (the welcome backdrop) and
`woven-cloth` (the speeches wall). Both follow the same rule — the authored
source is stored verbatim and never imported; a build script derives a
content-patched document from it.

## `3d-paper`

These files are the **authored source**, retrieved from the registry and stored
verbatim. Nothing here is edited, and nothing here is imported by the
application.

- Retrieved from: `https://threeui.com/source-code/3d-paper.json`
- Manifest with per-file sizes and hashes: `SOURCE.json`
- Every file's SHA-256 matches the value published in the integration brief.
  `src/shaders/__tests__/vendoredSource.test.ts` re-checks this on every test
  run, so an accidental edit — or a silent upstream change after a re-fetch —
  fails the build rather than shipping.

### Why it is here but not imported

The brief requires the real source rather than a recreation, and these files are
that source. The application does not import them for two reasons:

1. `ThreeDPaper.tsx` statically imports all four variant documents with `?raw`,
   which puts roughly **2.5 MB** into the JavaScript bundle. The whole Mesa
   application bundle is ~280 KB, and this lands on the welcome screen — the one
   screen that must be interactive immediately on a kiosk.
2. It inlines the document with `srcDoc`. A sandboxed `srcDoc` frame has an
   opaque origin, so it cannot load same-origin assets; the authored document
   therefore fetches its fonts from `fonts.googleapis.com` at runtime. A voting
   kiosk on a hall's wifi should not depend on a third-party request.

Instead, `scripts/build-paper-variant.mjs` derives
`apps/web/public/paper/mesa-elections.html` from
`3d-paper/sources/3d-paper-site-of-the-year.html`. It re-verifies the source
hash, then applies an enumerated, content-only set of patches — the certificate
text, the background word, the accent colours, inlined fonts, and a redraw once
webfonts settle. Shaders, paper simulation, lighting, camera, interaction,
grain and the bundled three.js r149 are untouched.

The authored variant is also served unmodified at `/paper/site-of-the-year.html`
for comparison.

## `woven-cloth`

- Retrieved from: `https://threeui.com/source-code/woven-cloth.json`
- Manifest: `woven-cloth/SOURCE.json`
- All seven registered files match the SHA-256 published in the integration
  brief, re-checked by `src/shaders/__tests__/norenSource.test.ts`.

Not imported, for the same two reasons as above: `WovenCloth.tsx` pulls every
variant in with `?raw`, and it inlines them with `srcDoc`, whose opaque origin
is why the authored document fetches three.js r160 from `cdn.jsdelivr.net`
at runtime.

`scripts/build-noren-variant.mjs` derives
`apps/web/public/noren/forge-speeches.html` from
`woven-cloth/sources/woven-cloth-washi.html`. It re-verifies the source hash,
then applies content-only patches: the sleeve and panel wording, the school's
mark stencilled in place of the checkerboard *mon*, the r160 bundle inlined, and
a texture re-upload once the mark decodes. The cloth simulation, the slit
panels, the deckle edge, the material, the lighting and the camera fit are
untouched, and the test fails on any line of the authored script disappearing
that it has not been told about.

The inlined engine is byte-identical to what jsdelivr serves for
`three@0.160.0`, which the build asserts against the npm package. `three` is a
**devDependency** for that reason alone — nothing imports it.

## Licence

ThreeUI / `@designcodeio/threeui` — see `LICENSE` in the published package.
The vendored `3d-paper` documents embed three.js r149 and the derived noren
embeds r160 — MIT, © three.js authors.
