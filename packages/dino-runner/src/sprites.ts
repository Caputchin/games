// Sprite art lives as editable pixel-art SVG files under src/assets/sprites/.
// The tsup build inlines each one as a `data:image/svg+xml;base64,…` URI; the
// game decodes those URIs back to SVG markup at runtime so the source
// `fill="currentColor"` keeps inheriting the skin's active day / night color
// through CSS (an `<img src>` would NOT inherit). Each sprite is also exposed
// as a skin asset key in caputchin.json so a customer skin can swap the art
// (e.g. a monkey reskin) without touching code.
//
// Decode + sanitize logic mirrors leaf-memory's leaves helper: the iframe is
// sandbox="allow-scripts" (no allow-same-origin) but still holds the Cap
// token + postMessage bridge, so a customer-supplied skin is a trust-boundary
// risk and active SVG content is stripped before injection.

import runnerIdle from './assets/sprites/runner-idle.svg';
import runnerRun1 from './assets/sprites/runner-run-1.svg';
import runnerRun2 from './assets/sprites/runner-run-2.svg';
import runnerJump from './assets/sprites/runner-jump.svg';
import runnerDuck1 from './assets/sprites/runner-duck-1.svg';
import runnerDuck2 from './assets/sprites/runner-duck-2.svg';
import runnerCrash from './assets/sprites/runner-crash.svg';
import cactusSmall from './assets/sprites/cactus-small.svg';
import cactusLarge from './assets/sprites/cactus-large.svg';
import bird1 from './assets/sprites/bird-1.svg';
import bird2 from './assets/sprites/bird-2.svg';
import cloud from './assets/sprites/cloud.svg';
import moon from './assets/sprites/moon.svg';
import star from './assets/sprites/star.svg';
import ground from './assets/sprites/ground.svg';
import restart from './assets/sprites/restart.svg';

export type SpriteId =
  | 'runner-idle'
  | 'runner-run-1'
  | 'runner-run-2'
  | 'runner-jump'
  | 'runner-duck-1'
  | 'runner-duck-2'
  | 'runner-crash'
  | 'cactus-small'
  | 'cactus-large'
  | 'bird-1'
  | 'bird-2'
  | 'cloud'
  | 'moon'
  | 'star'
  | 'ground'
  | 'restart';

export const SPRITE_IDS: readonly SpriteId[] = [
  'runner-idle',
  'runner-run-1',
  'runner-run-2',
  'runner-jump',
  'runner-duck-1',
  'runner-duck-2',
  'runner-crash',
  'cactus-small',
  'cactus-large',
  'bird-1',
  'bird-2',
  'cloud',
  'moon',
  'star',
  'ground',
  'restart',
];

/** Skin asset key for each sprite, exactly matching the `skins.schema` keys
 *  in caputchin.json. */
export const SPRITE_ASSET_KEY: Record<SpriteId, string> = {
  'runner-idle': 'sprite_runner_idle',
  'runner-run-1': 'sprite_runner_run_1',
  'runner-run-2': 'sprite_runner_run_2',
  'runner-jump': 'sprite_runner_jump',
  'runner-duck-1': 'sprite_runner_duck_1',
  'runner-duck-2': 'sprite_runner_duck_2',
  'runner-crash': 'sprite_runner_crash',
  'cactus-small': 'sprite_cactus_small',
  'cactus-large': 'sprite_cactus_large',
  'bird-1': 'sprite_bird_1',
  'bird-2': 'sprite_bird_2',
  cloud: 'sprite_cloud',
  moon: 'sprite_moon',
  star: 'sprite_star',
  ground: 'sprite_ground',
  restart: 'sprite_restart',
};

/** Bundled default data URI per sprite. Used when `ctx.skin` is null or when
 *  a customer skin omits a sprite override. Each value is a base64-encoded
 *  `data:image/svg+xml` URI produced by tsup's `dataurl` loader. */
export const DEFAULT_SPRITE_URIS: Record<SpriteId, string> = {
  'runner-idle': runnerIdle,
  'runner-run-1': runnerRun1,
  'runner-run-2': runnerRun2,
  'runner-jump': runnerJump,
  'runner-duck-1': runnerDuck1,
  'runner-duck-2': runnerDuck2,
  'runner-crash': runnerCrash,
  'cactus-small': cactusSmall,
  'cactus-large': cactusLarge,
  'bird-1': bird1,
  'bird-2': bird2,
  cloud,
  moon,
  star,
  ground,
  restart,
};

/** Decode a `data:image/svg+xml` URI back into raw SVG markup so it can be
 *  injected via innerHTML and still inherit `currentColor`. Returns an empty
 *  string for malformed or non-data URIs (e.g. an `https://` skin override —
 *  the caller falls back to the bundled default for that sprite). */
export function decodeSvgDataUri(uri: string): string {
  // Group 1 is the meta segment (`;base64` / `;charset=…`, possibly empty),
  // group 2 the payload. Sniffing `;base64` on the meta alone keeps a plain
  // URL-encoded body whose text happens to contain "base64" from mis-routing
  // to atob.
  const m = /^data:image\/svg\+xml((?:;[^,]*)?),([\s\S]*)$/.exec(uri);
  if (!m) return '';
  try {
    return /;base64/i.test(m[1]!) ? atob(m[2]!) : decodeURIComponent(m[2]!);
  } catch {
    return '';
  }
}

/** Strip active content from SVG markup before injecting via innerHTML.
 *  Defense-in-depth alongside the widget's MIME guard and the sandbox: drops
 *  `<script>` / `<style>` blocks, inline `on*=` handlers, and
 *  `javascript:` / `data:text/html` URIs on href / src / xlink:href. The
 *  attribute-name separator class `[\s/]` also covers the `<svg/onload=…>`
 *  HTML5-parser quirk. Regex-based on purpose: small surface, no deps. */
export function sanitizeSvgMarkup(raw: string): string {
  if (raw.length === 0) return '';
  return raw
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/[\s/](?:xlink:href|href|src)\s*=\s*"\s*(?:javascript|data:text\/html)[^"]*"/gi, '')
    .replace(/[\s/](?:xlink:href|href|src)\s*=\s*'\s*(?:javascript|data:text\/html)[^']*'/gi, '');
}

/** Resolve the final inline-SVG string per sprite id. Cascade per sprite:
 *    1. customer override (`ctx.skin?.sprite_<id>`) — only `data:image/svg+xml`
 *       payloads survive decoding; URL-form overrides pass the widget's image
 *       validator but can't be inline-injected, so they fall back.
 *    2. bundled `DEFAULT_SPRITE_URIS[id]`.
 *  Both paths run through `sanitizeSvgMarkup`. */
export function resolveSprites(
  skin: Readonly<Record<string, string>> | null | undefined,
): Record<SpriteId, string> {
  const out = {} as Record<SpriteId, string>;
  for (const id of SPRITE_IDS) {
    const overrideUri = skin?.[SPRITE_ASSET_KEY[id]];
    let decoded = '';
    if (typeof overrideUri === 'string' && overrideUri.length > 0) {
      decoded = decodeSvgDataUri(overrideUri);
    }
    if (decoded.length === 0) {
      decoded = decodeSvgDataUri(DEFAULT_SPRITE_URIS[id]);
    }
    out[id] = sanitizeSvgMarkup(decoded);
  }
  return out;
}
