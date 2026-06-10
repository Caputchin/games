// Locale string access. The widget resolves one of the bundled presets and hands
// it down as ctx.locale; this wraps it with English fallbacks so the game always
// has copy. The English values here are the canonical source the `en` preset
// mirrors. Used live only (rendering + ARIA announcements).

import type { ResolvedLocale } from '@caputchin/game-sdk';

const EN = {
  ariaIntro: 'Chef Rush, a cooking reaction game. An order lists the ingredients a dish needs. Each ingredient appears at its station: chop vegetables on the board, stir grains in the pot, flip meat in the pan. Cook the ones the order needs, and leave the wrong and the rotten alone.',
  instruction: 'Cook what the order needs: chop, stir, flip. Skip the wrong and the rotten.',
  served: 'Order served.',
  mistake: 'Wrong ingredient.',
  missed: 'An ingredient spoiled.',
  verified: 'Verified. Orders all served.',
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
