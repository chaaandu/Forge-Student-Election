# Vendored: ThreeUI `3d-paper`

These files are the **authored source**, retrieved from the registry and stored
verbatim. Nothing here is edited, and nothing here is imported by the
application.

- Retrieved from: `https://threeui.com/source-code/3d-paper.json`
- Manifest with per-file sizes and hashes: `SOURCE.json`
- Every file's SHA-256 matches the value published in the integration brief.
  `src/shaders/__tests__/vendoredSource.test.ts` re-checks this on every test
  run, so an accidental edit — or a silent upstream change after a re-fetch —
  fails the build rather than shipping.

## Why it is here but not imported

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

## Licence

ThreeUI / `@designcodeio/threeui` — see `LICENSE` in the published package.
The vendored documents embed three.js r149, MIT, © three.js authors.
