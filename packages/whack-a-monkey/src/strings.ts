// Lookup helper for ctx.locale text tokens with template substitution and a
// hardcoded English fallback. Mirrors fruit-slash / dino-runner so the game
// renders sensible copy even when the widget resolves no locale.
//
// The FALLBACK map IS the English preset in caputchin.json; the two are kept in
// lockstep by tests/strings.test.ts (key set + value parity + token parity).

import type { ResolvedLocale } from '@caputchin/game-sdk';

const FALLBACK = {
  ariaGame:
    'Tap the monkeys as they peek out of the bushes and leave the other jungle animals alone. Tap enough monkeys with clean aim to verify you are human.',
  headerTime: 'Time',
  headerGoal: 'Monkeys',
  headerLevel: 'Level',
  headerScore: 'Score',
  headerLives: 'Lives',
  startTitle: 'Whack-a-Monkey',
  startBody:
    'Tap the monkeys as they peek out of the bushes. Leave the other jungle animals alone. Tap enough monkeys, and keep your aim clean, to verify you are human.',
  startButton: 'Start',
  controlsHint: 'Tap the monkeys, not the other animals',
  winTitle: 'Verified',
  winBody: 'Nice aim. You scored {score}.',
  overTitle: 'Round over',
  overBody: 'You scored {score}. Give it another go.',
  retryButton: 'Try again',
  ariaSound: 'Sound',
  verifiedBadge: 'Verified',
  announceStart: 'Go',
  announceHit: 'Whacked. Score {score}.',
  announceDecoy: 'Not that one.',
  announceLevel: 'Level {level}.',
  announceWin: 'Verified. You scored {score}. Well done.',
  announceOver: 'Round over. You scored {score}.',
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
