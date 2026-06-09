// Locale string access. The widget resolves one of the bundled presets and hands
// it down as ctx.locale; this wraps it with English fallbacks so the game always
// has copy. The English values here are the canonical source the `en` preset
// mirrors. Used live only (rendering + ARIA announcements).

import type { ResolvedLocale } from '@caputchin/game-sdk';

const EN = {
  ariaIntro: 'Chef Rush, a cooking reaction game. Slash each dish in the arrow direction before it spoils, and never touch a dish marked with an X.',
  instruction: 'Slash dishes the way the arrow points. Skip the X.',
  served: 'Dish served.',
  spoiledHit: 'You touched a spoiled dish. Round over.',
  missed: 'A dish spoiled.',
  verified: 'Verified. Kitchen cleared.',
  failed: 'Round over.',
} as const;

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd']);

export type StringKey = keyof typeof EN;

export interface Strings {
  readonly lang: string;
  readonly direction: 'ltr' | 'rtl';
  t(key: StringKey, vars?: Record<string, string | number>): string;
}

export function buildStrings(locale: ResolvedLocale | null): Strings {
  const map = (locale ?? {}) as Record<string, unknown>;
  const lang = typeof map['_lang'] === 'string' ? (map['_lang'] as string) : 'en';
  const dirMeta = map['_direction'];
  const direction: 'ltr' | 'rtl' =
    dirMeta === 'rtl' || dirMeta === 'ltr' ? dirMeta : RTL.has(lang.split('-')[0]!) ? 'rtl' : 'ltr';

  return {
    lang,
    direction,
    t(key, vars) {
      const raw = typeof map[key] === 'string' ? (map[key] as string) : EN[key];
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? `{${k}}`));
    },
  };
}

/** The canonical English token map (consumed by the locale-preset parity test). */
export { EN as ENGLISH_STRINGS };
