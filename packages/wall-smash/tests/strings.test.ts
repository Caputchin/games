// Parity between src/strings.ts (the TS source of truth the announcer + the Bevy
// build both read) and .caputchin/locales.json (the translated presets). A drift here
// would blank or mis-key a screen in some language, so it is a hard test.

import { describe, it, expect } from 'vitest';
import { buildStrings, FALLBACK_STRINGS, STRING_KEYS } from '../src/strings.js';
import type { ResolvedLocale } from '@caputchin/game-sdk';
import locales from '../.caputchin/locales.json';

const METADATA = new Set(['_lang', '_direction', '_default', '_extends']);
const schemaKeys = Object.keys(locales.schema);
const english = locales.presets.English as Record<string, string | boolean>;

describe('strings.ts <-> locales.json parity', () => {
  it('FALLBACK_STRINGS declares exactly the locales schema keys', () => {
    expect(new Set(Object.keys(FALLBACK_STRINGS))).toEqual(new Set(schemaKeys));
  });

  it('FALLBACK_STRINGS matches the English preset verbatim', () => {
    const englishText = Object.keys(english).filter((k) => !METADATA.has(k));
    expect(new Set(englishText)).toEqual(new Set(Object.keys(FALLBACK_STRINGS)));
    for (const [key, value] of Object.entries(FALLBACK_STRINGS)) {
      expect(english[key], key).toBe(value);
    }
  });

  it('every preset translates every schema key (no gaps)', () => {
    for (const [name, preset] of Object.entries(locales.presets)) {
      const p = preset as Record<string, unknown>;
      for (const key of schemaKeys) {
        expect(typeof p[key], `${name}.${key}`).toBe('string');
        expect((p[key] as string).length, `${name}.${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('preserves token placeholders across every preset', () => {
    // A {token} that survives in English must survive in every translation, or the
    // sim value (level / lives) would have nowhere to land.
    for (const key of schemaKeys) {
      const tokens = (locales.schema[key as keyof typeof locales.schema] as { tokens?: string[] })
        .tokens;
      if (!tokens) continue;
      for (const [name, preset] of Object.entries(locales.presets)) {
        const raw = String((preset as Record<string, unknown>)[key] ?? '');
        for (const tok of tokens) {
          expect(raw.includes(`{${tok}}`), `${name}.${key} missing {${tok}}`).toBe(true);
        }
      }
    }
  });
});

describe('Bevy positional contract (STRING_KEYS <-> live.rs txt::*)', () => {
  // game.ts marshals localeVec(...) in STRING_KEYS order into start(); the Bevy
  // screens index it by the txt::* consts in live.rs. These indices MUST line up or
  // the wrong string renders. Pin the rendered (screen) slots here.
  it('pins the screen-text indices', () => {
    expect(STRING_KEYS[1]).toBe('startPrompt'); // txt::START_PROMPT
    expect(STRING_KEYS[2]).toBe('levelToast'); // txt::LEVEL_TOAST
    expect(STRING_KEYS[3]).toBe('winTitle'); // txt::WIN_TITLE
    expect(STRING_KEYS[4]).toBe('winBody'); // txt::WIN_BODY
    expect(STRING_KEYS[5]).toBe('keepPlaying'); // txt::KEEP_PLAYING
    expect(STRING_KEYS[6]).toBe('loseTitle'); // txt::LOSE_TITLE
    expect(STRING_KEYS[7]).toBe('loseBody'); // txt::LOSE_BODY
    expect(STRING_KEYS[8]).toBe('tryAgain'); // txt::TRY_AGAIN
  });
});

describe('buildStrings', () => {
  it('falls back to English when no locale resolves', () => {
    const s = buildStrings(null);
    expect(s.lang).toBe('en');
    expect(s.direction).toBe('ltr');
    expect(s.t('startPrompt')).toBe(FALLBACK_STRINGS.startPrompt);
  });

  it('substitutes tokens and leaves missing ones intact', () => {
    const s = buildStrings(null);
    expect(s.t('levelToast', { level: 3 })).toBe('Level 3');
    expect(s.t('levelToast', {})).toBe('Level {level}');
  });

  it('honors a resolved RTL locale + direction', () => {
    const locale = locales.presets.Arabic as unknown as ResolvedLocale;
    const s = buildStrings(locale);
    expect(s.direction).toBe('rtl');
    expect(s.lang).toBe('ar');
    expect(s.t('winTitle')).toBe(locales.presets.Arabic.winTitle);
  });
});
