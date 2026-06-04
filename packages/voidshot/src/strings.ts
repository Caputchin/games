// Localized HUD + announcer strings. English is the canonical fallback; the
// platform resolves ctx.locale from .caputchin/locales.json (11 languages,
// authored by the translator agent). `{name}` placeholders interpolate.

import type { ResolvedLocale } from '@caputchin/game-sdk';

export const EN: Record<string, string> = {
  ariaGame:
    'Voidshot arena shooter. Fly your gunship toward the cursor to steer and aim; the guns fire forward automatically. Sweep the fire across the drone swarm while dodging, and clear every wave before your shield is gone. Screen reader: press Tab to target the next drone and your ship engages it.',
  start: 'Move to fly and aim, sweep the swarm, and dodge. Tap or press a key to launch.',
  hudWave: 'Wave {n}',
  hudScore: 'Score {n}',
  hudShield: 'Shield {n}',
  announceWave: 'Wave {n}: {count} drones inbound',
  announceShield: 'Shield {n} remaining',
  announceTarget: '{kind} at {clock}',
  announceNoTarget: 'Target destroyed. Press Tab for the next drone.',
  announceWin: 'Verified. All waves cleared.',
  announceLose: 'Shield down. Round over.',
  kindChaser: 'Chaser drone',
  kindWeaver: 'Weaver drone',
  kindSplitter: 'Splitter drone',
  oclock: "{n} o'clock",
  win: 'Verified',
  lose: 'Shield down',
  mute: 'Mute',
  unmute: 'Unmute',
  a11yHint: 'Tab targets the next drone',
};

/** Canonical key set; the locales.json schema must declare exactly these. */
export const STRING_KEYS: readonly string[] = Object.keys(EN);

export interface Strings {
  dir: 'ltr' | 'rtl';
  lang: string;
  t(key: string, params?: Record<string, string | number>): string;
}

export function buildStrings(locale: ResolvedLocale | null | undefined): Strings {
  const dir = locale?._direction === 'rtl' ? 'rtl' : 'ltr';
  const lang = typeof locale?._lang === 'string' ? locale._lang : 'en';
  return {
    dir,
    lang,
    t(key, params) {
      const raw =
        locale && typeof locale[key] === 'string' ? (locale[key] as string) : EN[key] ?? key;
      if (!params) return raw;
      let out = raw;
      for (const [k, v] of Object.entries(params)) {
        out = out.split(`{${k}}`).join(String(v));
      }
      return out;
    },
  };
}

/** Localized name for a drone kind code (0 chaser, 1 weaver, 2 splitter). */
export function kindName(strings: Strings, kind: number): string {
  if (kind === 1) return strings.t('kindWeaver');
  if (kind === 2) return strings.t('kindSplitter');
  return strings.t('kindChaser');
}

/** A localized 12-hour clock bearing for a world direction (12 = away from camera). */
export function clockBearing(strings: Strings, dx: number, dz: number): string {
  // -z is "12 o'clock" (north, away). Clockwise increases the hour.
  const ang = Math.atan2(dx, -dz); // 0 at 12, +pi/2 at 3 o'clock
  let hour = Math.round((ang / (Math.PI * 2)) * 12);
  hour = ((hour % 12) + 12) % 12;
  if (hour === 0) hour = 12;
  return strings.t('oclock', { n: hour });
}
