// State machine for Leaf Memory: start, playing, won, lost.
// Persistent shell (header + stage + actions) keeps the iframe footprint
// stable across every state and difficulty.
//
// bridge.pass is gated: only fires on the first successful round of the
// session or when the player sets a new session-best score.

import type { Bridge, GameContext } from '@caputchin/game-sdk';
import { createBoard, revealAll, coverAll, type Board } from './board.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { isWithinTimeBudget, score as scoreOf } from './scoring.js';
import { STYLES } from './styles.js';
import { realClock, type Clock } from './time.js';
import {
  DIFFICULTY_LADDER,
  MAX_LEVEL,
  levelAt,
  type DifficultyLevel,
} from './difficulty.js';
import {
  renderStartScreen,
  renderWinScreen,
  renderLossScreen,
} from './screens.js';
import { buildStrings, type StringKey } from './strings.js';

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  clock?: Clock;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** Override the per-level peek (memorize) phase duration. Tests use
   *  this to drive the clock without waiting on the real budget. */
  peekMsOverride?: number;
}

const WIN_TITLE_KEYS: StringKey[] = [
  'winTitleLevel1',
  'winTitleLevel2',
  'winTitleLevel3',
  'winTitleLevel4',
];

// Indexed by current level (0-based). The MAX_LEVEL-1 slot has no entry
// because the level-up button is hidden at the top of the ladder.
const HARDER_KEYS: StringKey[] = [
  'winLevelUpAfter1',
  'winLevelUpAfter2',
  'winLevelUpAfter3',
];

export function runLeafMemory(opts: GameOptions): () => void {
  const {
    container,
    bridge,
    ctx,
    clock = realClock,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    peekMsOverride,
  } = opts;

  const strings = buildStrings(ctx?.lang);
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;

  if (!doc.getElementById('lm-styles')) {
    const style = doc.createElement('style');
    style.id = 'lm-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  const root = doc.createElement('div');
  root.className = 'lm-root';
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');

  const header = doc.createElement('div');
  header.className = 'lm-header';
  const bestEl = doc.createElement('span');
  bestEl.className = 'lm-best';
  const levelEl = doc.createElement('span');
  levelEl.className = 'lm-level';
  const timeEl = doc.createElement('span');
  timeEl.className = 'lm-time';
  header.appendChild(bestEl);
  header.appendChild(levelEl);
  header.appendChild(timeEl);
  root.appendChild(header);

  const stage = doc.createElement('div');
  stage.className = 'lm-board-area';
  root.appendChild(stage);

  const actions = doc.createElement('div');
  actions.className = 'lm-actions';
  root.appendChild(actions);

  const announcer = createAnnouncer(doc);
  root.appendChild(announcer.element);

  container.appendChild(root);

  let bestScore: number | null = null;
  let currentIndex = 0;
  let board: Board | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let peekTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let active = false;
  let disposed = false;

  function renderBest(): void {
    const value = bestScore === null ? strings.t('bestEmpty') : String(bestScore);
    bestEl.innerHTML = `<span class="label">${strings.t('headerBest')}</span>${value}`;
  }

  function renderLevel(level: DifficultyLevel | null): void {
    if (level === null) {
      levelEl.dataset['hidden'] = 'true';
      levelEl.textContent = '';
      return;
    }
    levelEl.dataset['hidden'] = 'false';
    const value = strings.t('levelDisplay', { current: level.level, max: MAX_LEVEL });
    levelEl.innerHTML = `<span class="label">${strings.t('headerLevel')}</span>${value}`;
  }

  function renderTime(remainingSec: number | null): void {
    if (remainingSec === null) {
      timeEl.dataset['hidden'] = 'true';
      timeEl.textContent = '';
      return;
    }
    timeEl.dataset['hidden'] = 'false';
    const value = strings.t('timeDisplay', { seconds: Math.ceil(remainingSec) });
    timeEl.innerHTML = `<span class="label">${strings.t('headerTime')}</span>${value}`;
  }

  function elapsedSec(): number {
    return (clock.now() - startedAt) / 1000;
  }

  function stopTimer(): void {
    if (tickTimer !== null) {
      clearIntervalFn(tickTimer);
      tickTimer = null;
    }
  }

  function clearStage(): void {
    if (board) {
      board.destroy();
      board.element.remove();
      board = null;
    }
    if (peekTimer !== null) {
      clearTimeoutFn(peekTimer);
      peekTimer = null;
    }
    stopTimer();
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    while (actions.firstChild) actions.removeChild(actions.firstChild);
  }

  function showStart(): void {
    clearStage();
    active = false;
    renderLevel(null);
    renderTime(null);
    renderBest();
    const screen = renderStartScreen(doc, strings, () => {
      currentIndex = 0;
      startRound();
    });
    stage.appendChild(screen);
    const startBtn = screen.querySelector('button');
    if (startBtn instanceof HTMLButtonElement) startBtn.focus();
  }

  function showWin(score: number, newBest: boolean): void {
    clearStage();
    renderTime(null);
    renderBest();
    const onHarder =
      currentIndex < DIFFICULTY_LADDER.length - 1
        ? () => {
            currentIndex += 1;
            startRound();
          }
        : null;
    const titleKey = WIN_TITLE_KEYS[currentIndex] ?? 'winTitleLevel1';
    const harderKey = onHarder ? HARDER_KEYS[currentIndex] ?? 'winLevelUpDefault' : undefined;
    const screen = renderWinScreen(doc, strings, {
      title: strings.t(titleKey),
      score,
      newBest,
      onRetry: () => startRound(),
      onHarder,
      harderLabel: harderKey ? strings.t(harderKey) : undefined,
    });
    stage.appendChild(screen);
    const firstBtn = screen.querySelector('button');
    if (firstBtn instanceof HTMLButtonElement) firstBtn.focus();
  }

  function showLoss(): void {
    clearStage();
    renderTime(null);
    renderBest();
    const onEasier =
      currentIndex > 0
        ? () => {
            currentIndex -= 1;
            startRound();
          }
        : null;
    const screen = renderLossScreen(doc, strings, {
      onRetry: () => startRound(),
      onEasier,
    });
    stage.appendChild(screen);
    const firstBtn = screen.querySelector('button');
    if (firstBtn instanceof HTMLButtonElement) firstBtn.focus();
  }

  function startRound(): void {
    clearStage();
    const level = levelAt(currentIndex);
    const budget = level.timeSec;
    const peek = peekMsOverride ?? level.peekMs;
    renderLevel(level);
    renderTime(budget);
    renderBest();

    const newBoard = createBoard({
      pairs: level.pairs,
      cols: level.cols,
      doc,
      announcer,
      strings,
      setTimeoutFn,
      clearTimeoutFn,
      callbacks: {
        onMatch: () => {},
        onMismatch: () => {},
        onRoundCleared: () => onRoundCleared(level),
      },
    });
    board = newBoard;
    stage.appendChild(newBoard.element);

    function startTimer(): void {
      startedAt = clock.now();
      renderTime(budget);
      tickTimer = setIntervalFn(() => {
        if (disposed) return;
        const e = elapsedSec();
        const remaining = Math.max(0, budget - e);
        renderTime(remaining);
        if (!isWithinTimeBudget(budget, e)) {
          onTimeout();
        }
      }, 250);
    }

    if (prefersReducedMotion(view)) {
      announcer.say(strings.t('announceRoundStarted'));
      active = true;
      startTimer();
      return;
    }

    revealAll(newBoard);
    announcer.say(strings.t('announceMemorize'));

    // Skippable peek: any click on the board ends the memorize phase
    // immediately and starts the timer. The click itself doesn't count
    // as a pick (board.pick early-returns while cards are still flipped
    // from revealAll), so the player's first real pick happens after
    // the board flips face-down.
    function endPeek(): void {
      if (peekTimer === null) return;
      clearTimeoutFn(peekTimer);
      peekTimer = null;
      if (disposed) return;
      newBoard.element.removeEventListener('click', endPeek);
      coverAll(newBoard);
      announcer.say(strings.t('announceRoundStarted'));
      active = true;
      startTimer();
    }

    newBoard.element.addEventListener('click', endPeek);
    peekTimer = setTimeoutFn(endPeek, peek);
  }

  function onTimeout(): void {
    if (!active) return;
    active = false;
    stopTimer();
    announcer.say(strings.t('announceOutOfTime'));
    showLoss();
  }

  function onRoundCleared(level: DifficultyLevel): void {
    if (!active) return;
    active = false;
    stopTimer();
    const e = elapsedSec();
    const s = Math.round(scoreOf(level.pairs, level.timeSec, e));
    const isFirstPass = bestScore === null;
    const isNewBest = bestScore === null || s > bestScore;
    if (isFirstPass || isNewBest) {
      bestScore = s;
      bridge.pass({ score: s, durationMs: Math.round(e * 1000) });
    }
    announcer.say(strings.t('announceRoundPassed'));
    showWin(s, isNewBest);
  }

  showStart();

  return function cleanup(): void {
    disposed = true;
    active = false;
    stopTimer();
    if (peekTimer !== null) {
      clearTimeoutFn(peekTimer);
      peekTimer = null;
    }
    board?.destroy();
    root.remove();
  };
}
