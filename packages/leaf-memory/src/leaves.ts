// Leaf art lives as editable SVG files under src/assets/leaves/. The tsup
// build inlines each one as a `data:image/svg+xml;base64,…` URI; the game
// decodes those URIs back to SVG markup at runtime so the existing
// `fill="currentColor"` inheritance pipes through CSS like before. Each
// leaf is also exposed as a skin asset key in caputchin.json so a future
// customer-curated skin can swap the art.

import fern from './assets/leaves/fern.svg';
import monsteraA from './assets/leaves/monstera-a.svg';
import monsteraB from './assets/leaves/monstera-b.svg';
import monsteraC from './assets/leaves/monstera-c.svg';
import bananaHand from './assets/leaves/banana-hand.svg';
import heart from './assets/leaves/heart.svg';

export type LeafId =
  | 'fern'
  | 'monstera-a'
  | 'monstera-b'
  | 'monstera-c'
  | 'banana-hand'
  | 'heart';

export const LEAF_IDS: readonly LeafId[] = [
  'fern',
  'monstera-a',
  'monstera-b',
  'monstera-c',
  'banana-hand',
  'heart',
];

/** Skin asset key for each leaf, exactly matching the `skins.schema` keys
 *  in caputchin.json. Lets game.ts thread `ctx.skin?.[LEAF_ASSET_KEY[id]]`
 *  in one place. */
export const LEAF_ASSET_KEY: Record<LeafId, string> = {
  fern: 'leaf_fern',
  'monstera-a': 'leaf_monstera_a',
  'monstera-b': 'leaf_monstera_b',
  'monstera-c': 'leaf_monstera_c',
  'banana-hand': 'leaf_banana_hand',
  heart: 'leaf_heart',
};

/** Bundled default data URI per leaf. Used when `ctx.skin` is null or when
 *  the customer skin omits a leaf override. Each value is a base64-encoded
 *  `data:image/svg+xml` URI produced by tsup's `dataurl` loader. */
export const DEFAULT_LEAF_URIS: Record<LeafId, string> = {
  fern,
  'monstera-a': monsteraA,
  'monstera-b': monsteraB,
  'monstera-c': monsteraC,
  'banana-hand': bananaHand,
  heart,
};

/** Decode a `data:image/svg+xml` URI back into raw SVG markup so it can be
 *  injected via innerHTML and still inherit `currentColor`. Returns an
 *  empty string when the URI is malformed or non-data (e.g. an `https://`
 *  URL - caller is expected to fall back). The widget validator gates
 *  the MIME at the door; we still re-check the prefix here so a
 *  caller-supplied raw `<svg>` string can't slip through. */
export function decodeSvgDataUri(uri: string): string {
  // Capture group 1 is the meta segment (e.g. `;base64` or `;charset=utf-8`,
  // possibly empty), group 2 is the payload. Sniffing `;base64` on the meta
  // alone keeps the test honest: a `data:image/svg+xml,<svg>%3Bbase64</svg>`
  // payload would otherwise mis-route to atob and crash, even though the
  // body is plain URL-encoded.
  const m = /^data:image\/svg\+xml((?:;[^,]*)?),([\s\S]*)$/.exec(uri);
  if (!m) return '';
  try {
    return /;base64/i.test(m[1]!) ? atob(m[2]!) : decodeURIComponent(m[2]!);
  } catch {
    return '';
  }
}

/** Strip active-content from SVG markup before injecting it via innerHTML.
 *  Defense-in-depth: the widget validator only checks the data: MIME (not
 *  the payload), and the iframe is `sandbox="allow-scripts"` without
 *  allow-same-origin - but the iframe still holds the Cap verification
 *  token + postMessage bridge, so a customer-supplied skin with active
 *  content is a trust-boundary risk. We strip the common SVG-XSS vectors:
 *    - `<script>…</script>` blocks
 *    - inline `on*=` event handlers
 *    - `javascript:` / `data:text/html` URIs on href / src / xlink:href
 *  This is intentionally regex-based (not a full DOM parse) - small
 *  surface, no extra deps. The defense is layered against the widget's
 *  MIME guard and the sandbox boundary, not the sole gate. */
export function sanitizeSvgMarkup(raw: string): string {
  if (raw.length === 0) return '';
  // Attribute-name separator class covers both whitespace AND `/`: the HTML5
  // tag parser accepts `<svg/onload="…">` as equivalent to `<svg onload="…">`,
  // so requiring `\s` alone leaves an empirical bypass (verified in
  // happy-dom: the slash-form survives sanitize and the parser materializes
  // an `onload` attribute). `[\s/]` closes that gap.
  return raw
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/[\s/]on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/[\s/](?:xlink:href|href|src)\s*=\s*"\s*(?:javascript|data:text\/html)[^"]*"/gi, '')
    .replace(/[\s/](?:xlink:href|href|src)\s*=\s*'\s*(?:javascript|data:text\/html)[^']*'/gi, '');
}

/** Resolve the final inline-SVG string per leaf id. Cascade:
 *    1. customer override (`ctx.skin?.leaf_<id>`) - only `data:image/svg+xml`
 *       payloads survive decoding; URL-form overrides (`https://cdn/x.svg`)
 *       pass the widget's image validator but can't be inline-injected, so
 *       they fall back to the bundled default for that leaf.
 *    2. bundled `DEFAULT_LEAF_URIS[id]` - the build-time-loaded SVG.
 *  In both paths the decoded markup runs through `sanitizeSvgMarkup`. */
export function resolveLeafSvgs(skin: Readonly<Record<string, string | boolean | number>> | null | undefined): Record<LeafId, string> {
  const out = {} as Record<LeafId, string>;
  for (const id of LEAF_IDS) {
    const key = LEAF_ASSET_KEY[id];
    const overrideUri = skin?.[key];
    let decoded = '';
    if (typeof overrideUri === 'string' && overrideUri.length > 0) {
      decoded = decodeSvgDataUri(overrideUri);
    }
    if (decoded.length === 0) {
      decoded = decodeSvgDataUri(DEFAULT_LEAF_URIS[id]);
    }
    out[id] = sanitizeSvgMarkup(decoded);
  }
  return out;
}
