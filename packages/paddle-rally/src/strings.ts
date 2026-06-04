// Lookup helper for ctx.locale text tokens with template substitution and a
// hardcoded English fallback, so the game renders sensible copy even when the
// widget resolves no locale. Mirrors the sibling games' strings helper.
//
// The FALLBACK map IS the English preset in .caputchin/locales.json; the two are
// kept in lockstep by tests/strings.test.ts.
import type { ResolvedLocale } from '@caputchin/game-sdk';

const FALLBACK = {
  ariaGame: 'Paddle Rally. Use the up and down arrows, or drag, to move your paddle.',
  score: 'Score',
  startObjective: 'Get the ball past your rival to score. Reach the target first to win.',
  startControls: 'Move with the arrow keys or by dragging. Press space or tap to begin.',
  startPrompt: 'Press space or tap to start',
  win: 'Nice run. Tap or press space to keep rallying.',
  lose: 'The rival reached the target. Tap or press space to try again.',
  endless: 'Endless rally. Keep playing.',
  verified: 'Verified',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  soloObjective: 'No rival, just a wall. Keep the ball alive and survive {n} returns to clear the check.',
  soloLose: 'Missed it. Tap or press space to try again.',
  soloProgress: 'Returns survived: {n} of {total}.',
} as const;

export type StringKey = keyof typeof FALLBACK;

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  direction: 'ltr' | 'rtl';
  /** Resolved BCP-47 language tag, surfaced for the root `lang` attribute and
   *  screen-reader voice. Defaults to `en` when no locale resolved. */
  lang: string;
}

export function buildStrings(locale: ResolvedLocale | null | undefined): Strings {
  return {
    direction: locale?._direction === 'rtl' ? 'rtl' : 'ltr',
    lang: locale?._lang ?? 'en',
    t(key, vars) {
      const raw = (locale && typeof locale[key] === 'string' ? (locale[key] as string) : FALLBACK[key]) ?? '';
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name) => {
        const v = vars[name];
        return v === undefined ? `{${name}}` : String(v);
      });
    },
  };
}

/** Exported so tests can assert the FALLBACK map stays in sync with the manifest
 *  English preset (key set + values). */
export const FALLBACK_STRINGS: Record<StringKey, string> = FALLBACK;
