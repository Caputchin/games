// Resolve the active skin into a canvas-usable palette. Canvas 2D fills need
// literal color strings (not CSS custom properties), so this is separate from
// the DOM-chrome theming in styles.ts (which uses --fs-* vars). Falls back to
// the bundled `light` preset literals when no skin resolves.

import type { ResolvedSkin } from '@caputchin/game-sdk';

export interface Palette {
  bg: string;
  blade: string;
  /** Three fruit fill colors, cycled per good target by its `hue`. */
  good: [string, string, string];
  goodStroke: string;
  hazard: string;
  hazardStroke: string;
}

const LIGHT: Palette = {
  bg: '#FBF7EF',
  blade: '#2E6FB7',
  good: ['#E8623B', '#F2A33C', '#6FBF5B'],
  goodStroke: '#3A3A38',
  hazard: '#3A3A38',
  hazardStroke: '#1B1B1A',
};

export function resolvePalette(skin: ResolvedSkin | null | undefined): Palette {
  if (!skin) return LIGHT;
  const pick = (key: string, fallback: string): string =>
    typeof skin[key] === 'string' ? (skin[key] as string) : fallback;
  return {
    bg: pick('bg', LIGHT.bg),
    blade: pick('blade', LIGHT.blade),
    good: [
      pick('good_1', LIGHT.good[0]),
      pick('good_2', LIGHT.good[1]),
      pick('good_3', LIGHT.good[2]),
    ],
    goodStroke: pick('good_stroke', LIGHT.goodStroke),
    hazard: pick('hazard', LIGHT.hazard),
    hazardStroke: pick('hazard_stroke', LIGHT.hazardStroke),
  };
}
