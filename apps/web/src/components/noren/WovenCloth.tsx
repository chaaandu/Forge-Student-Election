import type { CSSProperties } from 'react';

/**
 * The ThreeUI Woven Cloth, washi noren variant.
 *
 * PROVENANCE. The authored source is vendored verbatim and hash-verified in
 * `apps/web/vendor/threeui/woven-cloth/` (see `SOURCE.json` and the test
 * alongside it). The document this frame loads is derived from the `washi`
 * variant source by `scripts/build-noren-variant.mjs`, which re-verifies the
 * SHA-256 published in the integration brief before applying an enumerated set
 * of content-only patches. The cloth simulation, the panels' independent sway,
 * the deckle edge, the material, the lighting and the camera fit are untouched.
 *
 * WHY `src` AND NOT `srcDoc`. The authored `WovenCloth` inlines the document
 * with `srcDoc` and statically imports all three variants with `?raw`. With
 * three.js inlined that is ~2 MB of JavaScript in the bundle. Serving the
 * document from /public keeps it out of the bundle entirely and lets the
 * browser cache it — the same trade `PaperBackdrop` makes, recorded in
 * docs/design-direction.md.
 *
 * Everything else — the prop contract, the clamps, the filter, the sandbox, the
 * background colour, the layout style — is the authored behaviour, kept so the
 * component can be dropped in against the configured usage unchanged.
 */

export const WOVEN_CLOTH_VARIANTS = ['washi'] as const;
export type WovenClothVariant = (typeof WOVEN_CLOTH_VARIANTS)[number];

export type WovenClothProps = {
  variant?: WovenClothVariant;
  hue?: number;
  saturation?: number;
  brightness?: number;
  className?: string;
  style?: CSSProperties;
};

export const WOVEN_CLOTH_DEFAULTS = {
  hue: 0,
  saturation: 1,
  brightness: 1,
} as const;

type VariantDefinition = {
  title: string;
  background: string;
  document: string;
};

const VARIANTS: Record<WovenClothVariant, VariantDefinition> = {
  washi: {
    title: 'Woven Cloth washi noren',
    background: '#1d1c1d',
    document: '/noren/forge-speeches.html',
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function WovenCloth({
  variant = 'washi',
  hue = WOVEN_CLOTH_DEFAULTS.hue,
  saturation = WOVEN_CLOTH_DEFAULTS.saturation,
  brightness = WOVEN_CLOTH_DEFAULTS.brightness,
  className,
  style,
}: WovenClothProps) {
  const definition = VARIANTS[variant];

  const safeHue = clamp(hue, -180, 180);
  const safeSaturation = clamp(saturation, 0, 2);
  const safeBrightness = clamp(brightness, 0.35, 1.65);
  const filter =
    safeHue === 0 && safeSaturation === 1 && safeBrightness === 1
      ? undefined
      : `hue-rotate(${safeHue}deg) saturate(${safeSaturation}) brightness(${safeBrightness})`;

  return (
    <iframe
      className={className}
      title={definition.title}
      src={definition.document}
      // As authored: no `allow-same-origin`, so the frame cannot reach this
      // document, its storage, or a session token. It is artwork, nothing more.
      sandbox="allow-scripts"
      loading="eager"
      key={variant}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        border: 0,
        background: definition.background,
        filter,
        ...style,
      }}
    />
  );
}
