import { describe, it, expect } from 'vitest';
import type { ResolvedLocale } from '@caputchin/game-sdk';
import { buildStrings, ENGLISH_STRINGS } from '../src/strings.js';
import localesJson from '../.caputchin/locales.json';

const METADATA = new Set(['_lang', '_direction', '_default', '_extends']);
const enPreset = (localesJson.presets as Record<string, Record<string, string | boolean | undefined>>)['English']!;

describe('buildStrings', () => {
  it('falls back to English when no locale is given', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('instruction')).toBe(ENGLISH_STRINGS.instruction);
  });

  it('uses provided locale text and resolves RTL from _lang', () => {
    const ar = { _lang: 'ar', instruction: 'قطّع ما يطلبه الطلب.' } as unknown as ResolvedLocale;
    const s = buildStrings(ar);
    expect(s.lang).toBe('ar');
    expect(s.direction).toBe('rtl');
    expect(s.t('instruction')).toBe('قطّع ما يطلبه الطلب.');
    // missing keys still fall back to English
    expect(s.t('served')).toBe(ENGLISH_STRINGS.served);
  });
});

describe('fallback <-> shipped English-preset parity', () => {
  it('the strings.ts ENGLISH fallback matches the .caputchin English preset exactly', () => {
    const fallbackKeys = Object.keys(ENGLISH_STRINGS).sort();
    const presetKeys = Object.keys(enPreset).filter((k) => !METADATA.has(k)).sort();
    expect(presetKeys).toEqual(fallbackKeys);
    for (const k of fallbackKeys) {
      expect(enPreset[k] as string, `key "${k}" differs between fallback and the en preset`).toBe(
        (ENGLISH_STRINGS as Record<string, string>)[k],
      );
    }
  });
});
