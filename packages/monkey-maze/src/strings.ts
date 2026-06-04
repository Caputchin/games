// UI strings. English is the canonical baseline; the server resolves a locale
// preset from .caputchin/locales.json and hands it down as ctx.locale, which we
// merge over these defaults. RTL languages set direction so the shell mirrors.

export type StringKey =
  | 'ariaGame'
  | 'ariaUp'
  | 'ariaDown'
  | 'ariaLeft'
  | 'ariaRight'
  | 'soundOn'
  | 'soundOff'
  | 'objective'
  | 'start'
  | 'score'
  | 'goal'
  | 'dotsLeft'
  | 'verified'
  | 'caught'
  | 'cleared'
  | 'retry'
  | 'announceStart'
  | 'announcePower'
  | 'announceVerified'
  | 'announceCaught'
  | 'announceCleared';

const EN: Record<StringKey, string> = {
  ariaGame: 'Monkey Maze game',
  ariaUp: 'Move up',
  ariaDown: 'Move down',
  ariaLeft: 'Move left',
  ariaRight: 'Move right',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  objective: 'Grab {goal} bananas to win. Dodge the chasers!',
  start: 'Play',
  score: 'Score',
  goal: 'Goal',
  dotsLeft: 'Bananas left',
  verified: 'Verified',
  caught: 'Caught! Try again',
  cleared: 'Maze cleared!',
  retry: 'Play again',
  announceStart: 'Game started. Grab the bananas and avoid the chasers.',
  announcePower: 'Power coconut! Chasers are vulnerable.',
  announceVerified: 'Verified. You cleared enough of the maze.',
  announceCaught: 'A chaser caught you. Try again.',
  announceCleared: 'Maze cleared. Well done.',
};

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  lang: string;
  direction: 'ltr' | 'rtl';
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Merge a resolved locale preset (or null) over the English baseline. */
export function buildStrings(locale: Record<string, unknown> | null | undefined): Strings {
  const lang = typeof locale?.['_lang'] === 'string' ? (locale['_lang'] as string) : 'en';
  const table: Record<string, string> = { ...EN };
  if (locale) {
    for (const [k, v] of Object.entries(locale)) {
      if (typeof v === 'string' && k in EN) table[k] = v;
    }
  }
  const direction: 'ltr' | 'rtl' = RTL_LANGS.has(lang.split('-')[0] ?? '') ? 'rtl' : 'ltr';
  return {
    lang,
    direction,
    t: (key, vars) => interpolate(table[key] ?? EN[key], vars),
  };
}
