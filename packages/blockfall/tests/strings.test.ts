import { describe, it, expect } from 'vitest';
import { buildStrings } from '../src/strings.js';
import type { ResolvedLocale } from '@caputchin/game-sdk';

describe('buildStrings', () => {
  it('falls back to English when no locale is given', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('scoreLabel')).toBe('Score');
  });

  it('substitutes tokens', () => {
    const s = buildStrings(null);
    expect(s.t('clearedMany', { n: 3 })).toBe('3 lines cleared.');
    expect(s.t('gameOver', { score: 1200 })).toBe('Stack topped out. Final score 1200.');
  });

  it('uses provided locale text and resolves RTL from _lang', () => {
    const ar = { _lang: 'ar', scoreLabel: 'النقاط' } as unknown as ResolvedLocale;
    const s = buildStrings(ar);
    expect(s.lang).toBe('ar');
    expect(s.direction).toBe('rtl');
    expect(s.t('scoreLabel')).toBe('النقاط');
    // missing keys still fall back to English
    expect(s.t('linesLabel')).toBe('Lines');
  });
});
