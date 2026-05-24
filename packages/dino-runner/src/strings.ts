// Lookup helper for ctx.locale text tokens with template substitution and a
// hardcoded English fallback. Mirrors leaf-memory's strings helper so the
// game renders sensible copy even when the widget resolves no locale.
//
// The FALLBACK map IS the English preset in caputchin.json; the two are
// kept in lockstep by tests/strings.test.ts.

import type { ResolvedLocale } from '@caputchin/game-sdk';

const FALLBACK = {
  ariaGame: 'Endless runner. Jump the cactus, duck the birds, and run as far as you can.',
  headerScore: 'Score',
  headerBest: 'Best',
  startTitle: 'Dino Runner',
  startBody: 'Jump the cactus and duck the birds. Run as far as you can without crashing.',
  startButton: 'Start',
  controlsHint: 'Space or Up to jump, Down to duck',
  gameOverTitle: 'Game over',
  gameOverScore: 'Score {score}',
  gameOverBest: 'Best {score}',
  restartButton: 'Restart',
  ariaJump: 'Jump',
  ariaDuck: 'Duck',
  announceStart: 'Go',
  announceGameOver: 'Game over. You scored {score}.',
  announceNewBest: 'New best score: {score}.',
} as const;

export type StringKey = keyof typeof FALLBACK;

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  direction: 'ltr' | 'rtl';
  /** Resolved BCP-47 language tag, surfaced so game.ts can publish it as the
   *  root `lang` attribute (Han-glyph selection + screen-reader voice) and
   *  derive the CJK font stack. Defaults to `en` when no locale resolved. */
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
 *  manifest English preset (key set + token parity). */
export const FALLBACK_STRINGS: Record<StringKey, string> = FALLBACK;
