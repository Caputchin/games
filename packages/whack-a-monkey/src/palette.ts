// Resolve the active skin into a canvas-usable palette. Canvas 2D fills need
// literal color strings (not CSS custom properties), so this is separate from
// the DOM-chrome theming in styles.ts (which uses --wm-* vars). Falls back to
// the bundled `light` preset literals when no skin resolves.

import type { ResolvedSkin } from '@caputchin/game-sdk';

export interface Palette {
  bg: string;
  fg: string;
  /** Jungle background gradient, top to bottom. */
  canopyTop: string;
  canopyBottom: string;
  /** Tint for the bushes the monkeys hide behind. */
  foliage: string;
  /** Tint for the darker, distant foliage layer (depth). */
  foliageDark: string;
  /** Burst-particle color when a monkey is tapped. */
  goodTint: string;
  /** Overlay flash color when a decoy is tapped. */
  decoyFlash: string;
}

const LIGHT: Palette = {
  bg: '#357A2E',
  fg: '#F2F7EC',
  canopyTop: '#8FD15A',
  canopyBottom: '#357A2E',
  foliage: '#2E6B27',
  foliageDark: '#1E471B',
  goodTint: '#F5C842',
  decoyFlash: '#E74C3C',
};

export function resolvePalette(skin: ResolvedSkin | null | undefined): Palette {
  if (!skin) return LIGHT;
  const pick = (key: string, fallback: string): string =>
    typeof skin[key] === 'string' ? (skin[key] as string) : fallback;
  return {
    bg: pick('bg', LIGHT.bg),
    fg: pick('fg', LIGHT.fg),
    canopyTop: pick('canopy_top', LIGHT.canopyTop),
    canopyBottom: pick('canopy_bottom', LIGHT.canopyBottom),
    foliage: pick('foliage', LIGHT.foliage),
    foliageDark: pick('foliage_dark', LIGHT.foliageDark),
    goodTint: pick('good_tint', LIGHT.goodTint),
    decoyFlash: pick('decoy_flash', LIGHT.decoyFlash),
  };
}
