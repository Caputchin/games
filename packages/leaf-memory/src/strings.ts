// Lookup helper for ctx.lang text tokens with template substitution and
// hardcoded English fallback. Lives next to game.ts so screens.ts and
// board.ts can both import it without circular deps.

import type { ResolvedLanguage } from '@caputchin/game-sdk';

const FALLBACK: Record<string, string> = {
  headerBest: 'Best',
  headerLevel: 'Level',
  headerTime: 'Time',
  bestEmpty: '-',
  levelDisplay: '{current} / {max}',
  timeDisplay: '{seconds}s',
  announceRoundStarted: 'Round started',
  announceMemorize: 'Memorize the cards',
  announceOutOfTime: 'Out of time',
  announceRoundPassed: 'Round passed',
  announceMatch: 'Match',
  announceNoMatch: 'No match',
  ariaCard: 'Card {index}',
  ariaBoard: 'Memory board',
  startTitle: 'Leaf Memory',
  startBody: 'Flip two cards at a time to find matching leaves. Clear the board before time runs out.',
  startButton: 'Start',
  winTitleLevel1: 'You win!',
  winTitleLevel2: 'Nice memory!',
  winTitleLevel3: 'Razor sharp!',
  winTitleLevel4: 'No bot can ever be that good!',
  winBodyNewBest: 'New best score: {score}.',
  winBodyScore: 'Score: {score}.',
  winRetry: 'Retry',
  winLevelUpDefault: 'Level up!',
  winLevelUpAfter1: 'Bigger board!',
  winLevelUpAfter2: 'Even bigger!',
  winLevelUpAfter3: 'Final challenge!',
  lossTitle: 'Out of time',
  lossBody: 'The board did not clear before the buzzer.',
  lossRetry: 'Retry',
  lossEasier: 'Try easier',
};

export type StringKey = keyof typeof FALLBACK;

export interface Strings {
  t(key: StringKey, vars?: Record<string, string | number>): string;
  direction: 'ltr' | 'rtl';
}

export function buildStrings(lang: ResolvedLanguage | null | undefined): Strings {
  return {
    direction: lang?._direction === 'rtl' ? 'rtl' : 'ltr',
    t(key, vars) {
      const raw = (lang && typeof lang[key] === 'string' ? (lang[key] as string) : FALLBACK[key]) ?? '';
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name) => {
        const v = vars[name];
        return v === undefined ? `{${name}}` : String(v);
      });
    },
  };
}
