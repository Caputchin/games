// Skin-configurable art for Monkey Maze. EVERY visual asset is overridable from the
// site's skin via an `art_*` image key (data URI or URL); when an override is
// absent the game falls back to its bundled / procedural jungle default:
//
//   runner            -> art_runner    (default: Kenney capuchin PNG)
//   chaser 1..4       -> art_chaser_1..4 (default: frog / parrot / snake / sloth PNG)
//   banana (dot)      -> art_banana     (default: procedural banana, game.ts)
//   coconut (power)   -> art_coconut    (default: procedural coconut, game.ts)
//   wall (hedge tile) -> art_wall       (default: procedural leafy tile, game.ts)
//
// Bundled PNGs are inlined as data URIs at build time (tsup dataurl loader), so the
// game ships self-contained under the iframe CSP. Live render only - art never
// touches the replay verdict, so it loads async; until an image resolves the
// caller draws the procedural / fallback default.

import monkeyPng from './assets/monkey.png';
import frogPng from './assets/frog.png';
import parrotPng from './assets/parrot.png';
import snakePng from './assets/snake.png';
import slothPng from './assets/sloth.png';

export type ArtKey =
  | 'runner'
  | 'chaser1'
  | 'chaser2'
  | 'chaser3'
  | 'chaser4'
  | 'banana'
  | 'coconut'
  | 'wall';

export type ArtMap = Record<ArtKey, CanvasImageSource | null>;

const ART_KEYS: readonly ArtKey[] = [
  'runner', 'chaser1', 'chaser2', 'chaser3', 'chaser4', 'banana', 'coconut', 'wall',
];

/** Chaser kind index (0..3) -> its art key. */
export const CHASER_ART: readonly ArtKey[] = ['chaser1', 'chaser2', 'chaser3', 'chaser4'];

/** Bundled default per key. Keys with no entry (banana/coconut/wall) default to a
 *  procedural drawing in game.ts, so they have no bundled image. */
const BUNDLED: Partial<Record<ArtKey, string>> = {
  runner: monkeyPng,
  chaser1: frogPng,
  chaser2: parrotPng,
  chaser3: snakePng,
  chaser4: slothPng,
};

/** Skin override key per art key. */
const SKIN_KEY: Record<ArtKey, string> = {
  runner: 'art_runner',
  chaser1: 'art_chaser_1',
  chaser2: 'art_chaser_2',
  chaser3: 'art_chaser_3',
  chaser4: 'art_chaser_4',
  banana: 'art_banana',
  coconut: 'art_coconut',
  wall: 'art_wall',
};

export function emptyArt(): ArtMap {
  return {
    runner: null, chaser1: null, chaser2: null, chaser3: null, chaser4: null,
    banana: null, coconut: null, wall: null,
  };
}

function loadOne(doc: Document, src: string): Promise<CanvasImageSource | null> {
  if (src.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new (doc.defaultView ?? window).Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // broken override -> procedural/fallback default
    img.src = src;
  });
}

/** Resolve every art slot: the site's `art_<key>` skin override if present, else the
 *  bundled default (or null for the procedural-default slots). Never rejects. */
export async function loadArt(
  doc: Document,
  skin: Record<string, unknown> | null | undefined,
): Promise<ArtMap> {
  const entries = await Promise.all(
    ART_KEYS.map(async (key) => {
      const override = skin && typeof skin[SKIN_KEY[key]] === 'string'
        ? (skin[SKIN_KEY[key]] as string)
        : undefined;
      const src = override ?? BUNDLED[key] ?? '';
      return [key, await loadOne(doc, src)] as const;
    }),
  );
  return Object.fromEntries(entries) as ArtMap;
}
