// Round state machine. Wires the board, timer, scoring, and bridge.
// Owns nothing about DOM structure — board.ts handles that.

import type { Bridge } from '@caputchin/game-sdk';
import { createBoard, revealAll, coverAll, type Board } from './board.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { isWithinTimeBudget, maxTimeSec, score as scoreOf } from './scoring.js';
import { STYLES } from './styles.js';
import { realClock, type Clock } from './time.js';

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  pairs?: number;
  clock?: Clock;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  peekMs?: number;
}

const DEFAULT_PAIRS = 6;
const DEFAULT_PEEK_MS = 1500;

export function runLeafMemory(opts: GameOptions): () => void {
  const {
    container,
    bridge,
    pairs = DEFAULT_PAIRS,
    clock = realClock,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    peekMs = DEFAULT_PEEK_MS,
  } = opts;

  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const budget = maxTimeSec(pairs);

  // Mount the scoped stylesheet once per container.
  if (!doc.getElementById('lm-styles')) {
    const style = doc.createElement('style');
    style.id = 'lm-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  const root = doc.createElement('div');
  root.className = 'lm-root';

  const status = doc.createElement('div');
  status.className = 'lm-status';
  const timeEl = doc.createElement('span');
  const matchesEl = doc.createElement('span');
  status.appendChild(timeEl);
  status.appendChild(matchesEl);
  root.appendChild(status);

  const announcer = createAnnouncer(doc);
  root.appendChild(announcer.element);

  const actionRow = doc.createElement('div');
  actionRow.style.minHeight = '2.5rem';
  actionRow.style.display = 'flex';
  actionRow.style.alignItems = 'center';

  container.appendChild(root);

  let board: Board | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let peekTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let active = false;
  let disposed = false;

  function renderTime(elapsedSec: number): void {
    const remaining = Math.max(0, budget - elapsedSec);
    timeEl.innerHTML = `<span class="label">Time</span>${Math.ceil(remaining)}s`;
  }

  function renderMatches(b: Board): void {
    matchesEl.innerHTML = `<span class="label">Pairs</span>${b.matches} / ${pairs}`;
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

  function startTimer(): void {
    startedAt = clock.now();
    renderTime(0);
    tickTimer = setIntervalFn(() => {
      if (disposed) return;
      const e = elapsedSec();
      renderTime(e);
      if (!isWithinTimeBudget(pairs, e)) {
        onTimeout();
      }
    }, 250);
  }

  function onTimeout(): void {
    if (!active) return;
    active = false;
    stopTimer();
    announcer.say('Out of time');
    renderTime(budget);
    showReplay('Out of time — try again?');
  }

  function onRoundCleared(): void {
    if (!active) return;
    active = false;
    stopTimer();
    const e = elapsedSec();
    const s = scoreOf(pairs, e);
    bridge.pass({ score: s, durationMs: Math.round(e * 1000) });
    showReplay('Round passed — play again?');
  }

  function showReplay(label: string): void {
    actionRow.innerHTML = '';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'lm-action';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      startRound();
    });
    actionRow.appendChild(btn);
    if (!actionRow.isConnected) root.appendChild(actionRow);
    btn.focus();
  }

  function startRound(): void {
    // Tear down any previous board.
    if (board) {
      board.destroy();
      board.element.remove();
      board = null;
    }
    actionRow.innerHTML = '';
    if (actionRow.isConnected) actionRow.remove();

    const newBoard = createBoard({
      pairs,
      doc,
      announcer,
      setTimeoutFn,
      clearTimeoutFn,
      callbacks: {
        onMatch: () => renderMatches(newBoard),
        onMismatch: () => renderMatches(newBoard),
        onRoundCleared: () => {
          renderMatches(newBoard);
          onRoundCleared();
        },
      },
    });
    board = newBoard;
    root.appendChild(newBoard.element);
    renderMatches(newBoard);

    if (prefersReducedMotion(view)) {
      // Skip the peek + flip animation timing; start the timer immediately.
      announcer.say('Round started');
      active = true;
      startTimer();
      return;
    }

    revealAll(newBoard);
    announcer.say('Memorize the cards');
    peekTimer = setTimeoutFn(() => {
      peekTimer = null;
      if (disposed) return;
      coverAll(newBoard);
      announcer.say('Round started');
      active = true;
      startTimer();
    }, peekMs);
  }

  startRound();

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
