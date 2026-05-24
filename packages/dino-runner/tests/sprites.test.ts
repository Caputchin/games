import { describe, it, expect } from 'vitest';
import {
  resolveSprites,
  decodeSvgDataUri,
  sanitizeSvgMarkup,
  SPRITE_IDS,
  SPRITE_ASSET_KEY,
} from '../src/sprites.js';

describe('decodeSvgDataUri', () => {
  it('decodes a base64 svg data URI', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
    expect(decodeSvgDataUri(uri)).toBe(svg);
  });

  it('decodes a url-encoded svg data URI', () => {
    const uri = 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E';
    expect(decodeSvgDataUri(uri)).toBe('<svg></svg>');
  });

  it('returns empty for a non-data URL', () => {
    expect(decodeSvgDataUri('https://cdn.example/x.svg')).toBe('');
    expect(decodeSvgDataUri('data:image/png;base64,AAAA')).toBe('');
  });
});

describe('sanitizeSvgMarkup', () => {
  it('strips scripts, inline handlers and dangerous hrefs', () => {
    const dirty =
      '<svg onload="x()"><script>evil()</script><a href="javascript:bad()">x</a><rect/></svg>';
    const clean = sanitizeSvgMarkup(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(clean.toLowerCase()).not.toContain('javascript:');
    expect(clean).toContain('<rect');
  });

  it('strips the slash-form handler quirk', () => {
    expect(sanitizeSvgMarkup('<svg/onload="x">')).not.toContain('onload');
  });
});

describe('resolveSprites', () => {
  it('returns inline SVG markup for every sprite id with a null skin', () => {
    const out = resolveSprites(null);
    for (const id of SPRITE_IDS) {
      expect(out[id], id).toContain('<svg');
    }
  });

  it('uses a customer data-URI override', () => {
    const custom = '<svg xmlns="http://www.w3.org/2000/svg" id="custom"><rect/></svg>';
    const uri = `data:image/svg+xml;base64,${Buffer.from(custom, 'utf-8').toString('base64')}`;
    const out = resolveSprites({ [SPRITE_ASSET_KEY['cactus-small']]: uri });
    expect(out['cactus-small']).toContain('id="custom"');
  });

  it('falls back to the bundled default when an override is a non-inline URL', () => {
    const out = resolveSprites({ [SPRITE_ASSET_KEY.cloud]: 'https://cdn.example/cloud.svg' });
    expect(out.cloud).toContain('<svg');
  });
});
