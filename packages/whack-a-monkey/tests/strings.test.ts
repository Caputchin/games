import { describe, it, expect } from 'vitest';
import { buildStrings, FALLBACK_STRINGS, type StringKey } from '../src/strings.js';
import localesJson from '../.caputchin/locales.json';

describe('buildStrings', () => {
  it('falls back to English when no locale resolves', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('headerTime')).toBe('Time');
  });

  it('substitutes tokens and leaves unknown tokens intact', () => {
    expect(buildStrings(null).t('winBody', { score: 5 })).toBe('Nice aim. You scored 5.');
    expect(buildStrings(null).t('announceLevel', {})).toBe('Level {level}.');
  });

  it('honors a resolved locale and its direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = buildStrings({ _lang: 'ar', _direction: 'rtl', headerGoal: 'القرود' } as any);
    expect(s.direction).toBe('rtl');
    expect(s.lang).toBe('ar');
    expect(s.t('headerGoal')).toBe('القرود');
  });
});

describe('FALLBACK stays in lockstep with the manifest English preset', () => {
  const en = localesJson.presets.English as unknown as Record<string, string>;
  const textKeys = Object.keys(en).filter((k) => !k.startsWith('_'));

  it('has the same key set', () => {
    expect(Object.keys(FALLBACK_STRINGS).sort()).toEqual([...textKeys].sort());
  });

  it('has identical values', () => {
    for (const k of textKeys) {
      expect(FALLBACK_STRINGS[k as StringKey]).toBe(en[k]);
    }
  });
});
