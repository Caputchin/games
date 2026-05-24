import { describe, it, expect } from 'vitest';
import { cjkFontStack } from '../src/fonts.js';

describe('cjkFontStack', () => {
  it('returns null for non-CJK / empty locales', () => {
    expect(cjkFontStack('en')).toBeNull();
    expect(cjkFontStack('ar')).toBeNull();
    expect(cjkFontStack(null)).toBeNull();
    expect(cjkFontStack('')).toBeNull();
  });

  it('selects Simplified vs Traditional Chinese by subtag', () => {
    expect(cjkFontStack('zh')).toContain('PingFang SC');
    expect(cjkFontStack('zh-Hans')).toContain('PingFang SC');
    expect(cjkFontStack('zh-Hant')).toContain('PingFang TC');
    expect(cjkFontStack('zh-TW')).toContain('PingFang TC');
  });

  it('selects Japanese and Korean stacks', () => {
    expect(cjkFontStack('ja')).toContain('Hiragino Sans');
    expect(cjkFontStack('ko')).toContain('Apple SD Gothic Neo');
  });

  it('ends every stack in sans-serif', () => {
    for (const lang of ['zh', 'zh-Hant', 'ja', 'ko']) {
      expect(cjkFontStack(lang)!.endsWith('sans-serif')).toBe(true);
    }
  });
});
