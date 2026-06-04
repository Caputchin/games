// Parity between src/strings.ts (the canonical EN source the announcer + HUD read)
// and .caputchin/locales.json (the 11 translated presets). Drift here would blank
// or mis-key a screen in some language, so it is a hard gate. Token preservation
// is checked against the EN source string directly (not a schema field), so a
// translation that drops a {n}/{count} placeholder fails even if the schema omits
// the token list.

import type { ResolvedLocale } from '@caputchin/game-sdk';
import { describe, expect, it } from 'vitest';
import locales from '../.caputchin/locales.json';
import { buildStrings, EN, STRING_KEYS } from '../src/strings.js';

const METADATA = new Set(['_lang', '_direction', '_default', '_extends']);
const schemaKeys = Object.keys(locales.schema);
const presets = locales.presets as Record<string, Record<string, unknown>>;
const english = presets.English!;

function tokensOf(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

describe('strings.ts <-> locales.json parity', () => {
  it('the locales schema declares exactly the canonical string keys', () => {
    expect(new Set(schemaKeys)).toEqual(new Set(STRING_KEYS));
  });

  it('the English preset matches the EN source verbatim', () => {
    const text = Object.keys(english).filter((k) => !METADATA.has(k));
    expect(new Set(text)).toEqual(new Set(STRING_KEYS));
    for (const key of STRING_KEYS) {
      expect(english[key], key).toBe(EN[key]);
    }
  });

  it('every preset translates every key (no gaps)', () => {
    for (const [name, preset] of Object.entries(presets)) {
      for (const key of schemaKeys) {
        expect(typeof preset[key], `${name}.${key}`).toBe('string');
        expect((preset[key] as string).length, `${name}.${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('preserves every {token} placeholder across all presets', () => {
    for (const key of STRING_KEYS) {
      const tokens = tokensOf(EN[key]!);
      if (tokens.length === 0) continue;
      for (const [name, preset] of Object.entries(presets)) {
        const raw = String(preset[key] ?? '');
        for (const tok of tokens) {
          expect(raw.includes(`{${tok}}`), `${name}.${key} missing {${tok}}`).toBe(true);
        }
      }
    }
  });
});

describe('buildStrings', () => {
  it('falls back to English when no locale resolves', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.dir).toBe('ltr');
    expect(s.t('win')).toBe(EN.win);
  });

  it('substitutes tokens and leaves missing ones intact', () => {
    const s = buildStrings(null);
    expect(s.t('hudWave', { n: 3 })).toBe('Wave 3');
    expect(s.t('hudWave', {})).toBe('Wave {n}');
  });

  it('honors a resolved RTL locale + direction', () => {
    const s = buildStrings(presets.Arabic as unknown as ResolvedLocale);
    expect(s.dir).toBe('rtl');
    expect(s.lang).toBe('ar');
  });
});
