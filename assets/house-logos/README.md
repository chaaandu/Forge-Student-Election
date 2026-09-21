# House crests

Drop one image per house here, named by house id:

```
samurai.png      blue kabuto
knights.png      red great helm
gladiators.png   green spartan helm
vikings.png      gold horned helm
```

PNG, JPG, WebP or SVG. Transparent background preferred — the crests sit on
both light plates and the dark welcome screen.

Then:

```bash
npm run houses:import
```

Anything missing keeps its drawn placeholder, so a partial set is fine.

**Colour is not read from the image.** A dominant-colour pass over a black
shield returns black, so each house's colour is declared in
`scripts/build-election-data.mjs`, sampled from the helm by eye. If a crest
changes colour, change it there and re-run `npm run data:build`.
