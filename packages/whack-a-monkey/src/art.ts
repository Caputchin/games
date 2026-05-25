// Sprite art for the monkey target + the four decoy animals. Unlike fruit-slash
// (which ships no default art and only draws shapes), Whack-a-Monkey BUNDLES a
// default sprite per animal (Kenney Animal Pack Remastered, CC0) inlined as a
// data URI at build time, so the game looks finished out of the box. A customer
// skin may override any sprite via an `art_<animal>` image key (data URI or
// URL). A missing or broken image resolves to null and game.ts draws a labelled
// fallback disc, so the game always renders.
//
// PNG is raster: it is fed straight to `new Image()` and drawn with
// `ctx.drawImage`. There is no decode / sanitize step (that was only needed for
// the inline SVG sprites in dino-runner / leaf-memory).

import type { ResolvedSkin } from '@caputchin/game-sdk';
import type { DecoySpecies } from './constants.js';
import { DECOY_SPECIES } from './constants.js';
import monkeyPng from './assets/monkey.png';
import frogPng from './assets/frog.png';
import parrotPng from './assets/parrot.png';
import snakePng from './assets/snake.png';
import slothPng from './assets/sloth.png';
import bushAPng from './assets/scenery/bush-a.png';
import bushBPng from './assets/scenery/bush-b.png';
import grassPng from './assets/scenery/grass.png';

export type SpriteKey = 'monkey' | DecoySpecies;
export type SpriteMap = Record<SpriteKey, CanvasImageSource | null>;

const BUNDLED: Record<SpriteKey, string> = {
  monkey: monkeyPng,
  frog: frogPng,
  parrot: parrotPng,
  snake: snakePng,
  sloth: slothPng,
};

const SPRITE_KEYS: SpriteKey[] = ['monkey', ...DECOY_SPECIES];

function loadOne(doc: Document, src: string): Promise<CanvasImageSource | null> {
  if (src.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new (doc.defaultView ?? window).Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // fall back to the drawn disc
    img.src = src;
  });
}

/** Resolve every sprite: a customer `art_<key>` skin override if present, else
 *  the bundled default. Never rejects; a broken override resolves to null and
 *  the caller draws the fallback. */
export async function loadSprites(doc: Document, skin: ResolvedSkin | null | undefined): Promise<SpriteMap> {
  const entries = await Promise.all(
    SPRITE_KEYS.map(async (key) => {
      const override = skin && typeof skin[`art_${key}`] === 'string' ? (skin[`art_${key}`] as string) : undefined;
      const img = await loadOne(doc, override ?? BUNDLED[key]);
      return [key, img] as const;
    }),
  );
  return Object.fromEntries(entries) as SpriteMap;
}

// ── Scenery (jungle foliage) ─────────────────────────────
// The foliage sprites (Kenney Foliage Sprites, CC0) are white silhouette masks;
// game.ts tints them to the skin's foliage colors at draw time, which also
// makes them recolor for free between the light (day) and dark (night) skins.
// Bundled only (no per-sprite skin override) to keep the skin surface small.

export interface SceneryArt {
  bushA: CanvasImageSource | null;
  bushB: CanvasImageSource | null;
  grass: CanvasImageSource | null;
}

export async function loadScenery(doc: Document): Promise<SceneryArt> {
  const [bushA, bushB, grass] = await Promise.all([
    loadOne(doc, bushAPng),
    loadOne(doc, bushBPng),
    loadOne(doc, grassPng),
  ]);
  return { bushA, bushB, grass };
}
