import { describe, it, expect } from 'vitest';
import { buildStrings, FALLBACK_STRINGS } from '../src/strings.js';
import type { ResolvedLocale } from '@caputchin/game-sdk';
import localesJson from '../.caputchin/locales.json';

const METADATA = new Set(['_lang', '_direction', '_default', '_extends']);
const english = localesJson.presets.English as unknown as Record<string, string>;
const englishKeys = Object.keys(english).filter((k) => !METADATA.has(k));

describe('strings FALLBACK ↔ manifest English parity', () => {
  it('FALLBACK_STRINGS has exactly the manifest English text keys', () => {
    expect(new Set(Object.keys(FALLBACK_STRINGS))).toEqual(new Set(englishKeys));
  });

  it('every FALLBACK value matches the manifest English value verbatim', () => {
    for (const key of englishKeys) {
      expect(FALLBACK_STRINGS[key as keyof typeof FALLBACK_STRINGS]).toBe(english[key]);
    }
  });
});

describe('buildStrings', () => {
  it('falls back to English when no locale resolves', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('startTitle')).toBe('Fruit Slash');
  });

  it('substitutes tokens and passes through missing ones', () => {
    const s = buildStrings(null);
    expect(s.t('winBody', { score: 7 })).toBe('Nice slicing. You sliced 7 fruit.');
    expect(s.t('announceLife', {})).toContain('{lives}');
  });

  it('honors a resolved locale + RTL direction', () => {
    const locale = { _lang: 'ar', _direction: 'rtl', startTitle: 'X' } as unknown as ResolvedLocale;
    const s = buildStrings(locale);
    expect(s.direction).toBe('rtl');
    expect(s.lang).toBe('ar');
    expect(s.t('startTitle')).toBe('X');
  });
});
