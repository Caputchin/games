// Localized UI text. One resolver feeds BOTH the screen-reader announcer (here, in
// the DOM) AND the in-Bevy screens (game.ts marshals the same strings into the wasm
// `start()` call -> a Bevy `Locale` resource). FALLBACK is the canonical English and
// is kept in lockstep with .caputchin/locales.json by a parity test.

import type { ResolvedLocale } from '@caputchin/game-sdk';

const FALLBACK = {
  /** Accessible name for the game region. */
  ariaGame: 'Wall Smash. Bounce the ball off the paddle to smash every brick before time runs out.',
  /** Start overlay, before the first launch. */
  startPrompt: 'Tap or press Space to launch',
  /** Brief toast shown when a new wall drops in. Token: {level}. */
  levelToast: 'Level {level}',
  /** Win/verified screen title. */
  winTitle: 'Verified',
  /** Win/verified screen body. */
  winBody: 'Wall cleared. You can keep playing.',
  /** Button on the win screen to continue into untimed bonus levels. */
  keepPlaying: 'Keep playing',
  /** Lose screen title (out of lives or out of time). */
  loseTitle: 'Round over',
  /** Lose screen body. */
  loseBody: 'Try again to verify.',
  /** Button on the lose screen to restart the round. */
  tryAgain: 'Try again',
  /** Boot loading label. */
  loading: 'Loading',
  /** Announce: ball launched. */
  announceLaunch: 'Ball launched.',
  /** Announce: new level. Token: {level}. */
  announceLevel: 'Level {level}.',
  /** Announce: a life was lost. Token: {lives}. */
  announceLifeLost: 'Lost a life. {lives} remaining.',
  /** Announce: cleared the wall and verified. */
  announceVerified: 'Verified. Wall cleared. You can keep playing.',
  /** Announce: round over without verifying. */
  announceLose: 'Round over. Try again to verify.',
  /** Short unit suffix on the HUD countdown number (rendered "30s"). */
  secondsShort: 's',
} as const;

export type StringKey = keyof typeof FALLBACK;

/** Stable key order. The Bevy build receives strings as a positional Vec<String>;
 *  this array IS that contract (game.ts -> start() -> Locale resource indexes here). */
export const STRING_KEYS: readonly StringKey[] = Object.keys(FALLBACK) as StringKey[];

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  direction: 'ltr' | 'rtl';
  lang: string;
}

function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

export function buildStrings(locale: ResolvedLocale | null | undefined): Strings {
  return {
    direction: locale?._direction === 'rtl' ? 'rtl' : 'ltr',
    lang: locale?._lang ?? 'en',
    t(key, vars) {
      const raw =
        (locale && typeof locale[key] === 'string' ? (locale[key] as string) : FALLBACK[key]) ?? '';
      return interpolate(raw, vars);
    },
  };
}

/** The localized text in STRING_KEYS order, for the Bevy build (no interpolation -
 *  Bevy fills {tokens} itself from sim state). */
export function localeVec(locale: ResolvedLocale | null | undefined): string[] {
  const s = buildStrings(locale);
  return STRING_KEYS.map((k) => s.t(k));
}

export const FALLBACK_STRINGS: Record<StringKey, string> = FALLBACK;
