// The skin contract for Chef Rush. A skin can recolor the kitchen AND swap the
// ingredient art: each ingredient has an optional image-override key, so an operator
// can drop in their own sprite set from the dashboard (the platform validates the
// image URL / data-URI before it ever reaches the game). The renderer reads exactly
// the keys declared here, and tests/skin-schema.test.ts fails the build if
// .caputchin/skins.json drifts from them - the same dead-pin guard the config has.

import { INGREDIENTS } from './sim/types';

/** Color skin keys the renderer reads, with their built-in defaults. The dashboard
 *  shows a color picker per key; absent / invalid falls back to the default. */
export const SKIN_COLORS: Record<string, string> = {
  wall: '#efd9bd',
  counter: '#aa7a48',
  board: '#e0bd84',
  board_edge: '#a07a44',
  ticket: '#fbf4e4',
  ink: '#3a2c1c',
  accent_color: '#56b84e',
  life_color: '#e8615a',
};

/** The skin key that overrides one ingredient's sprite (`art_<ingredient>`). A skin
 *  may supply an image here to replace the built-in art; absent means the bundled
 *  sprite is used. */
export const spriteSkinKey = (ingredientKey: string): string => `art_${ingredientKey}`;

/** Every per-ingredient image-override key, one per ingredient in roster order. */
export const SKIN_IMAGE_KEYS: readonly string[] = INGREDIENTS.map((i) => spriteSkinKey(i.key));
