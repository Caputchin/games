// Optional, host-supplied fruit / bomb art. Customers may theme the game by
// providing `art_good` / `art_hazard` image skin keys (absolute URL, bundle
// path, or data URI). When present we draw the image instead of the built-in
// shape; when absent or on load failure we fall back to the drawn shape, so the
// game always renders. v1 ships NO bundled art — the default skins draw shapes.

import type { ResolvedSkin } from '@caputchin/game-sdk';

export interface TargetArt {
  good: CanvasImageSource | null;
  hazard: CanvasImageSource | null;
}

function loadOne(doc: Document, src: string | undefined): Promise<CanvasImageSource | null> {
  if (typeof src !== 'string' || src.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new (doc.defaultView ?? window).Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // fall back to drawn shape
    img.src = src;
  });
}

/** Resolve optional target art from the skin. Never rejects: a missing or
 *  broken image resolves to null and the caller draws the built-in shape. */
export async function loadArt(doc: Document, skin: ResolvedSkin | null | undefined): Promise<TargetArt> {
  const good = skin && typeof skin['art_good'] === 'string' ? (skin['art_good'] as string) : undefined;
  const hazard = skin && typeof skin['art_hazard'] === 'string' ? (skin['art_hazard'] as string) : undefined;
  const [g, h] = await Promise.all([loadOne(doc, good), loadOne(doc, hazard)]);
  return { good: g, hazard: h };
}
