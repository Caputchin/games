// Guards the skin contract: skins.json (what operators tune) MUST line up with the
// keys the renderer reads (src/skin.ts). Without this, a renamed or missing key
// silently no-ops - the operator sets a color or drops in art and the game ignores
// it, with tsc + every other test still green. (This is exactly the bug the old
// skins.json had: it declared background/station/good_color while the renderer read
// wall/board/ticket.) The single source of truth is SKIN_COLORS + SKIN_IMAGE_KEYS.

import { describe, it, expect } from 'vitest';
import skins from '../.caputchin/skins.json';
import { SKIN_COLORS, SKIN_IMAGE_KEYS } from '../src/skin.js';

const schema = skins.schema as Record<string, { type: string }>;
const presets = skins.presets as Record<string, Record<string, unknown>>;
const colorKeys = Object.keys(SKIN_COLORS);
const imageKeys = [...SKIN_IMAGE_KEYS];
const allKeys = new Set<string>([...colorKeys, ...imageKeys]);

describe('chef-rush skin contract (skins.json <-> render)', () => {
  it('every color key the renderer reads has a color schema entry', () => {
    for (const k of colorKeys) {
      expect(schema, `no schema entry for color key "${k}"`).toHaveProperty(k);
      expect(schema[k]!.type, `${k} schema type`).toBe('color');
    }
  });

  it('every ingredient has an image-override schema entry', () => {
    for (const k of imageKeys) {
      expect(schema, `no schema entry for image override "${k}"`).toHaveProperty(k);
      expect(schema[k]!.type, `${k} schema type`).toBe('image');
    }
  });

  it('every schema key is one the renderer actually reads (no dead skin key)', () => {
    for (const k of Object.keys(schema)) {
      expect(allKeys.has(k), `schema key "${k}" is never read by the renderer (dead skin key)`).toBe(true);
    }
  });

  it('exactly one default preset, and it sets every color', () => {
    const defaults = Object.values(presets).filter((p) => p['_default'] === true);
    expect(defaults.length, 'exactly one _default preset').toBe(1);
    for (const k of colorKeys) {
      expect(typeof defaults[0]![k], `default preset must set color "${k}"`).toBe('string');
    }
  });
});
