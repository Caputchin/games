import { describe, it, expect } from 'vitest';
import { cjkFontStack } from '../src/fonts';

describe('cjkFontStack', () => {
  it('returns null for non-CJK / empty / missing locales', () => {
    expect(cjkFontStack('en')).toBeNull();
    expect(cjkFontStack('fr')).toBeNull();
    expect(cjkFontStack('ar')).toBeNull();
    expect(cjkFontStack('ru')).toBeNull();
    expect(cjkFontStack('')).toBeNull();
    expect(cjkFontStack(null)).toBeNull();
    expect(cjkFontStack(undefined)).toBeNull();
  });

  it('maps Japanese and Korean to their native stacks', () => {
    expect(cjkFontStack('ja')).toContain('Hiragino Sans');
    expect(cjkFontStack('ja')).toContain('Noto Sans JP');
    expect(cjkFontStack('ko')).toContain('Malgun Gothic');
    expect(cjkFontStack('ko')).toContain('Noto Sans KR');
  });

  it('defaults bare and mainland zh to the Simplified stack', () => {
    expect(cjkFontStack('zh')).toContain('PingFang SC');
    expect(cjkFontStack('zh-CN')).toContain('PingFang SC');
    expect(cjkFontStack('zh-Hans')).toContain('Noto Sans SC');
    expect(cjkFontStack('zh-SG')).toContain('PingFang SC');
  });

  it('maps Traditional subtags (Hant / TW / HK / MO) to the Traditional stack', () => {
    expect(cjkFontStack('zh-TW')).toContain('PingFang TC');
    expect(cjkFontStack('zh-Hant')).toContain('Noto Sans TC');
    expect(cjkFontStack('zh-HK')).toContain('Microsoft JhengHei');
    expect(cjkFontStack('zh-MO')).toContain('PingFang TC');
  });

  it('is case-insensitive and accepts underscore separators', () => {
    expect(cjkFontStack('JA')).toContain('Hiragino Sans');
    expect(cjkFontStack('ZH_HANT')).toContain('PingFang TC');
    expect(cjkFontStack('zh_tw')).toContain('PingFang TC');
  });

  it('every returned stack ends in the generic sans-serif fallback', () => {
    for (const iso of ['zh', 'zh-TW', 'ja', 'ko']) {
      expect(cjkFontStack(iso)!.endsWith('sans-serif')).toBe(true);
    }
  });
});
