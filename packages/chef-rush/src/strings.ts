// Locale string access. The widget resolves one of the bundled presets and hands
// it down as ctx.locale; this wraps it with English fallbacks so the game always
// has copy. The English values here are the canonical source the `en` preset
// mirrors. Used live only (rendering + ARIA announcements).

import type { ResolvedLocale } from '@caputchin/game-sdk';

const EN = {
  ariaIntro: 'Chef Rush, a cooking game. Ingredients arrive one at a time on the prep counter. The order card maps each ingredient a dish needs to its action: chop on the board, stir in the pot, flip in the pan. Drag an ingredient the order needs to its station and do the action to cook it; drag a wrong or rotten ingredient to the trash. Serve enough dishes to pass.',
  instruction: 'Drag each ingredient to its station and cook it. Trash the wrong and the rotten.',
  startPrompt: 'Tap to start',
  servedLabel: 'Served',
  served: 'Order served.',
  mistake: 'Wrong move.',
  missed: 'An ingredient spoiled.',
  verified: 'Verified. Orders all served.',
  failed: 'Round over.',
  wonTitle: 'Verified!',
  wonBody: 'Nice cooking. Keep playing if you like.',
  keepPlaying: 'Keep playing',
  lostTitle: 'Round over',
  lostBody: 'Out of lives. Give it another go.',
  tryAgain: 'Try again',
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
