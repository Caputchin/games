import { describe, it, expect } from 'vitest';
import type { ResolvedLocale } from '@caputchin/game-sdk';
import { buildStrings, FALLBACK_STRINGS } from '../src/strings.js';
import localesJson from '../.caputchin/locales.json';

const english = localesJson.presets.English as Record<string, string | boolean>;
const METADATA = new Set(['_lang', '_direction', '_default', '_extends']);

describe('FALLBACK_STRINGS vs manifest English preset', () => {
  it('declares exactly the manifest English text keys', () => {
    const manifestKeys = Object.keys(english).filter((k) => !METADATA.has(k));
    expect(new Set(Object.keys(FALLBACK_STRINGS))).toEqual(new Set(manifestKeys));
  });

  it('matches the manifest English values verbatim', () => {
    for (const [key, value] of Object.entries(FALLBACK_STRINGS)) {
      expect(english[key], key).toBe(value);
    }
  });
});

describe('buildStrings', () => {
  it('falls back to English when no locale is resolved', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('verified')).toBe('Verified');
  });

  it('honors a resolved locale + direction, falling back per missing key', () => {
    const locale: ResolvedLocale = { _lang: 'ar', _direction: 'rtl', score: 'النتيجة' };
    const s = buildStrings(locale);
    expect(s.direction).toBe('rtl');
    expect(s.lang).toBe('ar');
    expect(s.t('score')).toBe('النتيجة');
    expect(s.t('verified')).toBe('Verified'); // unspecified key falls back to English
  });
});
