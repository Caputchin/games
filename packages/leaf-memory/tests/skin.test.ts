import { describe, it, expect } from 'vitest';
import type { SkinPreset, SkinSchemaEntry } from '@caputchin/game-sdk';
import manifest from '../caputchin.json';
import { DEFAULT_LEAF_URIS, decodeSvgDataUri, LEAF_IDS, resolveLeafSvgs, sanitizeSvgMarkup } from '../src/leaves.js';

const skinPresets = manifest.skins?.presets as Record<string, SkinPreset>;
const skinSchema = (manifest.skins?.schema ?? {}) as Record<string, SkinSchemaEntry>;
const METADATA_KEYS = new Set(['_theme', '_default', '_extends']);

describe('leaf-memory caputchin.json - skin schema / preset parity', () => {
  it('declares a light and a dark preset both marked _default:true', () => {
    expect(skinPresets['light']?._theme).toBe('light');
    expect(skinPresets['light']?._default).toBe(true);
    expect(skinPresets['dark']?._theme).toBe('dark');
    expect(skinPresets['dark']?._default).toBe(true);
  });

  it('every color key in the light preset appears in the dark preset', () => {
    const lightKeys = Object.keys(skinPresets['light'] ?? {}).filter((k) => !METADATA_KEYS.has(k));
    const darkKeys = Object.keys(skinPresets['dark'] ?? {}).filter((k) => !METADATA_KEYS.has(k));
    expect(new Set(darkKeys)).toEqual(new Set(lightKeys));
  });

  it('every preset key is documented in skins.schema', () => {
    const lightKeys = Object.keys(skinPresets['light'] ?? {}).filter((k) => !METADATA_KEYS.has(k));
    for (const key of lightKeys) {
      expect(skinSchema, `skins.schema missing "${key}"`).toHaveProperty(key);
    }
  });

  it('all 6 leaf assets are declared in the schema as image type', () => {
    for (const id of LEAF_IDS) {
      const key = `leaf_${id.replace(/-/g, '_')}`;
      const entry = skinSchema[key];
      expect(entry, `schema missing leaf asset "${key}"`).toBeDefined();
      const type = typeof entry === 'string' ? entry : Array.isArray(entry) ? 'list' : (entry as { type: string }).type;
      expect(type).toBe('image');
    }
  });

  it('three-way structural parity: schema leaf_* ↔ LEAF_ASSET_KEY ↔ DEFAULT_LEAF_URIS', async () => {
    // Catches drift: if a future refactor adds a leaf to the schema but
    // forgets the LEAF_ASSET_KEY entry (or the SVG file), this fires.
    const { LEAF_ASSET_KEY, DEFAULT_LEAF_URIS } = await import('../src/leaves.js');
    const schemaLeafKeys = Object.keys(skinSchema).filter((k) => k.startsWith('leaf_'));
    const codeLeafKeys = Object.values(LEAF_ASSET_KEY);
    expect(new Set(codeLeafKeys)).toEqual(new Set(schemaLeafKeys));
    for (const id of LEAF_IDS) {
      expect(DEFAULT_LEAF_URIS[id], `DEFAULT_LEAF_URIS["${id}"]`).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('color values are hex strings starting with #', () => {
    for (const preset of Object.values(skinPresets)) {
      for (const [k, v] of Object.entries(preset)) {
        if (METADATA_KEYS.has(k)) continue;
        if (typeof v !== 'string') continue;
        expect(v.startsWith('#'), `${k}=${v}`).toBe(true);
      }
    }
  });
});

describe('leaves.ts - runtime decode pipeline', () => {
  it('DEFAULT_LEAF_URIS covers every leaf id', () => {
    for (const id of LEAF_IDS) {
      expect(DEFAULT_LEAF_URIS[id]).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('decodeSvgDataUri returns SVG markup with currentColor preserved', () => {
    const decoded = decodeSvgDataUri(DEFAULT_LEAF_URIS['fern']);
    expect(decoded).toMatch(/^<svg/);
    expect(decoded).toContain('currentColor');
  });

  it('decodeSvgDataUri returns empty string on malformed URI', () => {
    expect(decodeSvgDataUri('not a data uri')).toBe('');
    expect(decodeSvgDataUri('data:image/png;base64,abc')).toBe('');
  });

  it('decodeSvgDataUri handles URL-encoded payloads (non-base64)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
    expect(decodeSvgDataUri(uri)).toBe(svg);
  });

  it('resolveLeafSvgs falls back to defaults when skin is null', () => {
    const out = resolveLeafSvgs(null);
    expect(out['fern']).toMatch(/^<svg/);
    expect(out['monstera-a']).toMatch(/^<svg/);
  });

  it('resolveLeafSvgs prefers customer skin override per leaf', () => {
    const fakeOverride = 'data:image/svg+xml,' + encodeURIComponent('<svg id="custom-fern"></svg>');
    const out = resolveLeafSvgs({
      _theme: 'light',
      leaf_fern: fakeOverride,
    } as unknown as Record<string, string>);
    expect(out['fern']).toContain('custom-fern');
    expect(out['monstera-a']).toMatch(/^<svg/); // default preserved for non-overridden
  });

  it('resolveLeafSvgs falls back to default when override is a URL form (non-data: URI)', () => {
    // The widget validator accepts `https://...svg` as a valid image URL
    // and hands it through to the game. The decoder can only inline-render
    // data: URIs - URL form falls back to the bundled default so the card
    // doesn't render blank.
    const out = resolveLeafSvgs({
      _theme: 'light',
      leaf_fern: 'https://cdn.example.com/custom-fern.svg',
    } as unknown as Record<string, string>);
    expect(out['fern']).toMatch(/^<svg/);
    expect(out['fern']).toContain('currentColor'); // bundled default markup
  });

  it('resolveLeafSvgs falls back to default when override is a malformed data URI', () => {
    const out = resolveLeafSvgs({
      _theme: 'light',
      leaf_fern: 'data:image/svg+xml;base64,!!!not-base64!!!',
    } as unknown as Record<string, string>);
    expect(out['fern']).toMatch(/^<svg/);
  });
});

describe('sanitizeSvgMarkup - XSS defense-in-depth', () => {
  it('strips <script> blocks', () => {
    const out = sanitizeSvgMarkup('<svg><script>alert(1)</script><path/></svg>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
    expect(out).toContain('<path/>');
  });

  it('strips inline on* event handlers (double-quoted)', () => {
    const out = sanitizeSvgMarkup('<svg onload="alert(1)" width="100"></svg>');
    expect(out).not.toMatch(/onload/i);
    expect(out).toContain('width="100"');
  });

  it('strips inline on* event handlers (single-quoted)', () => {
    const out = sanitizeSvgMarkup("<svg onerror='alert(1)'></svg>");
    expect(out).not.toMatch(/onerror/i);
  });

  it('strips inline on* event handlers (unquoted)', () => {
    const out = sanitizeSvgMarkup('<svg onload=alert(1)></svg>');
    expect(out).not.toMatch(/onload/i);
  });

  it('strips javascript: hrefs', () => {
    const out = sanitizeSvgMarkup('<svg><a href="javascript:alert(1)"><circle/></a></svg>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<circle/>');
  });

  it('strips xlink:href data:text/html payloads', () => {
    const out = sanitizeSvgMarkup('<svg><use xlink:href="data:text/html,<svg/>" /></svg>');
    expect(out).not.toContain('data:text/html');
  });

  it('strips slash-separated on* handlers (HTML5 tag-parser bypass)', () => {
    // The HTML tag parser treats `/` as an attribute separator, so
    // `<svg/onload="alert(1)">` materializes an `onload` attribute when the
    // browser parses the markup. The sanitizer must catch that path.
    const out = sanitizeSvgMarkup('<svg/onload="alert(1)" width="10"></svg>');
    expect(out).not.toMatch(/onload/i);
    expect(out).toContain('width="10"');
    // Sanity-check via the live DOM: re-parsed output has no onload attr.
    const probe = document.createElement('div');
    probe.innerHTML = out;
    const svgEl = probe.querySelector('svg');
    expect(svgEl?.getAttribute('onload')).toBeNull();
  });

  it('strips slash-separated unquoted on* handlers', () => {
    const out = sanitizeSvgMarkup('<svg/onload=alert(1)></svg>');
    expect(out).not.toMatch(/onload/i);
  });

  it('strips slash-separated single-quoted on* handlers', () => {
    const out = sanitizeSvgMarkup("<svg/onerror='alert(1)'></svg>");
    expect(out).not.toMatch(/onerror/i);
  });

  it('strips slash-separated javascript: href', () => {
    const out = sanitizeSvgMarkup('<svg><a/href="javascript:alert(1)"><circle/></a></svg>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<circle/>');
  });

  it('strips <style> blocks (could contain url(...) attacks via @import)', () => {
    const out = sanitizeSvgMarkup('<svg><style>@import url("evil");</style><path/></svg>');
    expect(out).not.toContain('<style');
    expect(out).toContain('<path/>');
  });

  it('resolveLeafSvgs runs sanitize on customer-supplied SVG payload', () => {
    const attack = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0"/></svg>',
    );
    const out = resolveLeafSvgs({
      _theme: 'light',
      leaf_fern: attack,
    } as unknown as Record<string, string>);
    expect(out['fern']).not.toMatch(/onload/i);
    expect(out['fern']).not.toContain('<script');
    expect(out['fern']).toContain('<path d="M0 0"/>'); // benign content survives
  });
});
