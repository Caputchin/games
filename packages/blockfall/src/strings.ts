// Locale string access. The widget resolves one of the bundled presets and hands
// it down as ctx.locale; this wraps it with English fallbacks so the game always
// has copy. The English values here are the canonical source the `en` preset
// mirrors.

import type { ResolvedLocale } from '@caputchin/game-sdk';

const EN: Record<string, string> = {
  ariaGame: 'Blockfall, a falling-blocks puzzle. Clear lines to verify you are human.',
  startBody: 'Drag a block over an open gap, tap to spin it, swipe down to drop. Or play with the arrow keys and space. Clear {n} rows to verify you are human.',
  startButton: 'Start',
  scoreLabel: 'Score',
  linesLabel: 'Lines',
  clearedOne: 'One line cleared.',
  clearedMany: '{n} lines cleared.',
  verified: 'Verified. You may keep playing.',
  verifiedBody: "You're verified. Keep playing?",
  keepPlaying: 'Keep playing',
  tryAgain: 'Try again',
  playAgain: 'Play again',
  gameOver: 'Stack topped out. Final score {score}.',
  verifiedTitle: 'Verified',
  gameOverTitle: 'Topped out',
};

const RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd']);

export interface Strings {
  readonly lang: string;
  readonly direction: 'ltr' | 'rtl';
  t(key: keyof typeof EN, vars?: Record<string, string | number>): string;
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
      const raw = typeof map[key] === 'string' ? (map[key] as string) : EN[key]!;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? `{${k}}`));
    },
  };
}

/** The canonical English token map (consumed by the manifest-schema test). */
export { EN as ENGLISH_STRINGS };
