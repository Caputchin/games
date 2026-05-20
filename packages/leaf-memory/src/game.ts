// State machine for Leaf Memory: start → playing → won | lost.
// Persistent shell (header + stage + actions) keeps the iframe footprint
// stable across every state and difficulty.
//
// bridge.pass is gated: only fires on the first successful round of the
// session or when the player sets a new session-best score.

import type { Bridge } from '@caputchin/game-sdk';
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

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  clock?: Clock;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** Override the per-level peek (memorize) phase duration. Tests use
   *  this to drive the clock without waiting on the real budget. */
  peekMsOverride?: number;
}

// Per-level win-screen headline (indexed by current level, 0-based).
// Compliment ladder that lands the bot-resistance punchline at L4.
const WIN_TITLES = [
  'You win!',
  'Nice memory!',
  'Razor sharp!',
  'No bot can ever be that good!',
];

// Indexed by current level (0-based). Shown on the win screen as the
// label of the advance-level button. Tone climbs with the ladder so the
// final step reads like a boss-room invite. No entry at MAX_LEVEL-1
// since onHarder is null at the top — the button is hidden entirely.
const HARDER_LABELS = ['Bigger board!', 'Even bigger!', 'Final challenge!'];

export function runLeafMemory(opts: GameOptions): () => void {
  const {
    container,
    bridge,
    clock = realClock,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    peekMsOverride,
  } = opts;

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
    const value = bestScore === null ? '—' : String(bestScore);
    bestEl.innerHTML = `<span class="label">Best</span>${value}`;
  }

  function renderLevel(level: DifficultyLevel | null): void {
    if (level === null) {
      levelEl.dataset['hidden'] = 'true';
      levelEl.textContent = '';
      return;
    }
    levelEl.dataset['hidden'] = 'false';
    levelEl.innerHTML = `<span class="label">Level</span>${level.level} / ${MAX_LEVEL}`;
  }

  function renderTime(remainingSec: number | null): void {
    if (remainingSec === null) {
      timeEl.dataset['hidden'] = 'true';
      timeEl.textContent = '';
      return;
    }
    timeEl.dataset['hidden'] = 'false';
    timeEl.innerHTML = `<span class="label">Time</span>${Math.ceil(remainingSec)}s`;
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
    const screen = renderStartScreen(doc, () => {
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
    const screen = renderWinScreen(doc, {
      title: WIN_TITLES[currentIndex] ?? 'You win!',
      score,
      newBest,
      onRetry: () => startRound(),
      onHarder,
      harderLabel: onHarder ? HARDER_LABELS[currentIndex] : undefined,
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
    const screen = renderLossScreen(doc, {
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
      announcer.say('Round started');
      active = true;
      startTimer();
      return;
    }

    revealAll(newBoard);
    announcer.say('Memorize the cards');

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
      announcer.say('Round started');
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
    announcer.say('Out of time');
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
    announcer.say('Round passed');
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
