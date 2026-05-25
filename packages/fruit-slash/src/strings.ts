// Lookup helper for ctx.locale text tokens with template substitution and a
// hardcoded English fallback. Mirrors dino-runner's strings helper so the game
// renders sensible copy even when the widget resolves no locale.
//
// The FALLBACK map IS the English preset in caputchin.json; the two are kept in
// lockstep by tests/strings.test.ts (key set + value parity + token parity).

import type { ResolvedLocale } from '@caputchin/game-sdk';

const FALLBACK = {
  ariaGame: 'Slice the flying fruit and avoid the bombs. Slice enough fruit to verify you are human.',
  headerScore: 'Sliced',
  headerLives: 'Lives',
  startTitle: 'Fruit Slash',
  startBody: 'Swipe across the flying fruit to slice it. Avoid the bombs. Slice enough to verify you are human, then keep going for a high score.',
  startButton: 'Start',
  controlsHint: 'Swipe or drag across the fruit to slice it',
  winTitle: 'Verified',
  winBody: 'Nice slicing. You sliced {score} fruit.',
  gameOverTitle: 'Out of lives',
  gameOverBody: 'You sliced {score} fruit. Give it another go.',
  retryButton: 'Try again',
  ariaSound: 'Sound',
  verifiedBadge: 'Verified',
  announceStart: 'Go',
  announceSlice: 'Sliced {score}.',
  announceLife: 'Careful. {lives} lives left.',
  announceWin: 'Verified. You sliced {score} fruit. Keep going for a high score.',
  announceGameOver: 'Out of lives. You sliced {score} fruit.',
} as const;

export type StringKey = keyof typeof FALLBACK;

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  direction: 'ltr' | 'rtl';
  /** Resolved BCP-47 language tag, surfaced so game.ts can publish it as the
   *  root `lang` attribute (Han-glyph selection + screen-reader voice). */
  lang: string;
}

export function buildStrings(locale: ResolvedLocale | null | undefined): Strings {
  return {
    direction: locale?._direction === 'rtl' ? 'rtl' : 'ltr',
    lang: locale?._lang ?? 'en',
    t(key, vars) {
      const raw =
        (locale && typeof locale[key] === 'string' ? (locale[key] as string) : FALLBACK[key]) ?? '';
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name) => {
        const v = vars[name];
        return v === undefined ? `{${name}}` : String(v);
      });
    },
  };
}

/** Exported so tests can assert the FALLBACK map stays in sync with the
 *  manifest English preset (key set + values + tokens). */
export const FALLBACK_STRINGS: Record<StringKey, string> = FALLBACK;
