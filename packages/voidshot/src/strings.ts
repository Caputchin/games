// Localized HUD + announcer strings. English is the canonical fallback; the
// platform resolves ctx.locale from .caputchin/locales.json (11 languages,
// authored by the translator agent). `{name}` placeholders interpolate.

import type { ResolvedLocale } from '@caputchin/game-sdk';

export const EN: Record<string, string> = {
  ariaGame:
    'Voidshot arena shooter. Pilot your drone toward the cursor; the guns aim and fire automatically. Clear every wave of drones before your shield is depleted.',
  start: 'Tap or press any key to launch',
  hudWave: 'Wave {n}',
  hudScore: 'Score {n}',
  hudShield: 'Shield {n}',
  announceWave: 'Wave {n}: {count} drones inbound',
  announceShield: 'Shield {n} remaining',
  announceWin: 'Verified. All waves cleared.',
  announceLose: 'Shield down. Round over.',
  win: 'Verified',
  lose: 'Shield down',
  mute: 'Mute',
  unmute: 'Unmute',
  pulse: 'Pulse',
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
