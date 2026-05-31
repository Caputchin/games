// Orchestrates Leaf Memory LIVE play. The authoritative game logic
// is the headless reducer in sim/engine; this module is the live DRIVER +
// renderer around it: it builds the DOM shell, runs a FIXED-STEP loop that
// advances the reducer one logical tick at a time, records each card-pick as
// the opaque trace, and renders the reducer's view projection. Because the
// live driver and the server replay run the SAME reducer over the SAME
// recorded ticks, the live score equals the replayed verdict by construction.
//
// What lives HERE (render-only, never in the verdict): the DOM grid, CSS
// flip animations, accessibility announcements, HUD time / best / level
// display. These may use real time / Math.random freely - they never touch
// the sim. What crosses to the server is only the recorded card-pick trace;
// the seed comes from `ctx.seed`.
//
// Time model: the wall-clock countdown visible in the HUD is derived from
// ticksElapsed in the reducer's view projection - never from an independent
// setInterval. A fixed-step rAF loop advances ticks at FIXED_TIMESTEP_MS per
// step with the standard accumulator + catch-up clamp pattern.

import type { Bridge, GameContext, Seed } from '@caputchin/game-sdk';
import { encodeTrace, FIXED_TIMESTEP_MS, type TickInput } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
// engine.view is always defined (see sim/engine.ts). Bind once here so call
// sites get a non-optional reference without per-call `!` assertions.
const viewOf: (state: SimState) => SimView = engine.view!;
import type { SimAction, SimState, SimView } from './sim/types.js';
import { LEAF_IDS } from './leaves.js';
import { resolveLeafSvgs } from './leaves.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { buildStrings } from './strings.js';
import { cjkFontStack } from './fonts.js';
import { resolveLeafMemoryConfig } from './config.js';
import { DIFFICULTY_LADDER, type DifficultyLevel } from './difficulty.js';
import {
  renderStartScreen,
  renderWinScreen,
  renderLossScreen,
} from './screens.js';
import { STYLES, CELL_GAP, CELL_MIN, CELL_MAX } from './styles.js';
import type { StringKey } from './strings.js';

// Skin color keys consumed as CSS custom properties. Each `foo_bar` key
// resolves to `--lm-foo-bar` via `applyPaletteVars`, matching styles.ts.
const SKIN_COLOR_KEYS: readonly string[] = [
  'bg', 'text', 'label', 'title',
  'card_back_bg', 'card_back_text',
  'card_front_bg', 'card_front_text',
  'card_border', 'card_match_accent',
  'button_bg', 'button_text', 'button_hover',
  'button_secondary_text', 'button_secondary_border',
  'button_secondary_hover_bg', 'focus_ring',
];

const WIN_TITLE_KEYS: StringKey[] = [
  'winTitleLevel1', 'winTitleLevel2', 'winTitleLevel3', 'winTitleLevel4',
];

const HARDER_KEYS: StringKey[] = [
  'winLevelUpAfter1', 'winLevelUpAfter2', 'winLevelUpAfter3',
];

// Real-time clamp: after a tab stall we cap a single frame's real delta so
// the game pauses (rather than fast-forwarding) through the stall. The
// recorded trace only holds the ticks that actually ran, so replay
// reproduces them either way.
const MAX_FRAME_DT = 0.1; // seconds
const MAX_STEPS_PER_FRAME = 10;

// Throwaway seed for no-verify mounts (Math.random is driver-side, fine).
function randomSeed(): Seed {
  const u = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;
  return [u(), u(), u(), u()];
}

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  /** Injectable rAF; tests supply a fake. */
  raf?: (cb: (ts: number) => void) => number;
  caf?: (handle: number) => void;
  now?: () => number;
  /** Override peek (memorize) duration in ms. Tests use this to drive the
   *  peek phase without waiting for the real budget. */
  peekMsOverride?: number;
}

export function runLeafMemory(opts: GameOptions): () => void {
  const { container, bridge, ctx, peekMsOverride } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);
  const now = opts.now ?? (() => (view.performance?.now ? view.performance.now() : Date.now()));

  const strings = buildStrings(ctx?.locale);
  const leafSvgs = resolveLeafSvgs(ctx?.skin ?? null);
  // The RAW dashboard config. The display resolver below derives the level
  // ladder + visibility toggles from it; per round, the engine resolves the
  // SAME raw object (with start_level pinned to the round) into its SimConfig.
  const rawConfig = (ctx?.config ?? null) as Record<string, unknown> | null;
  const memoryConfig = resolveLeafMemoryConfig(rawConfig);

  /** The raw config for a given round's level: the dashboard object with
   *  `start_level` overridden to the round being played, so `engine.init`
   *  resolves the matching SimConfig. */
  function rawConfigForLevel(index: number): Record<string, unknown> {
    return { ...(rawConfig ?? {}), start_level: index + 1 };
  }

  if (!doc.getElementById('lm-styles')) {
    const style = doc.createElement('style');
    style.id = 'lm-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  const root = doc.createElement('div');
  root.className = 'lm-root';
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  root.setAttribute('lang', strings.lang);
  const cjkStack = cjkFontStack(strings.lang);
  if (cjkStack) root.style.setProperty('--lm-cjk', cjkStack);

  const palette = ctx?.skin ?? null;
  if (palette) {
    for (const key of SKIN_COLOR_KEYS) {
      const value = palette[key];
      if (typeof value === 'string') {
        root.style.setProperty(`--lm-${key.replace(/_/g, '-')}`, value);
      }
    }
    if (palette._theme) root.dataset.skinTheme = palette._theme;
  }

  // ---- HUD ---------------------------------------------------------------
  const header = doc.createElement('div');
  header.className = 'lm-header';
  const bestEl = doc.createElement('span');
  bestEl.className = 'lm-best';
  const levelEl = doc.createElement('span');
  levelEl.className = 'lm-level';
  const timeEl = doc.createElement('span');
  timeEl.className = 'lm-time';
  header.append(bestEl, levelEl, timeEl);
  root.appendChild(header);

  if (!memoryConfig.showHighScore) bestEl.style.visibility = 'hidden';
  if (!memoryConfig.showLevelIndicator) levelEl.style.visibility = 'hidden';

  const stage = doc.createElement('div');
  stage.className = 'lm-board-area';
  root.appendChild(stage);

  const actions = doc.createElement('div');
  actions.className = 'lm-actions';
  root.appendChild(actions);

  const announcer = createAnnouncer(doc);
  root.appendChild(announcer.element);

  container.appendChild(root);

  // ---- responsive cell sizing -------------------------------------------
  let currentLevel: DifficultyLevel | null = null;

  function applyCellSize(): void {
    if (!currentLevel) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const { cols, rows } = currentLevel;
    const cellW = (rect.width - (cols - 1) * CELL_GAP) / cols;
    const cellH = (rect.height - (rows - 1) * CELL_GAP) / rows;
    const raw = Math.min(cellW, cellH);
    const size = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(raw)));
    root.style.setProperty('--lm-cell-size', `${size}px`);
  }

  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => {
      if (!disposed) applyCellSize();
    });
    resizeObserver.observe(stage);
  }

  // ---- driver state -------------------------------------------------------
  type Status = 'waiting' | 'peeking' | 'playing' | 'over';
  let status: Status = 'waiting';
  // Throwaway init so simState is non-null before the first round; replaced on
  // startRound. null -> the engine's L1 defaults.
  let simState: SimState = engine.init({ seed: [0, 0, 0, 0], config: null });
  let recorded: TickInput<SimAction>[] = [];
  let logicalTick = 0;
  let acc = 0;
  let lastMs: number | null = null;
  let rafHandle = 0;
  let disposed = false;
  let bestScore: number | null = null;
  let currentIndex = memoryConfig.startIndex;
  // Rendered grid DOM nodes, indexed by card index.
  let cells: HTMLButtonElement[] = [];
  let peekTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const seed: Seed = ctx?.seed ?? randomSeed();

  // ---- HUD render ---------------------------------------------------------
  function renderBest(): void {
    if (!memoryConfig.showHighScore) return;
    const value = bestScore === null ? strings.t('bestEmpty') : String(bestScore);
    bestEl.innerHTML = `<span class="label">${strings.t('headerBest')}</span>${value}`;
  }

  function renderLevel(level: DifficultyLevel | null): void {
    if (!memoryConfig.showLevelIndicator) return;
    if (level === null) {
      levelEl.dataset['hidden'] = 'true';
      levelEl.textContent = '';
      return;
    }
    levelEl.dataset['hidden'] = 'false';
    levelEl.innerHTML =
      `<span class="label">${strings.t('headerLevel')}</span>` +
      strings.t('levelDisplay', { current: level.level, max: DIFFICULTY_LADDER.length });
  }

  function renderTime(v: SimView | null): void {
    if (v === null) {
      timeEl.dataset['hidden'] = 'true';
      timeEl.textContent = '';
      return;
    }
    timeEl.dataset['hidden'] = 'false';
    const remainingMs = Math.max(0, (v.budgetTicks - v.ticksElapsed) * FIXED_TIMESTEP_MS);
    const remainingSec = Math.ceil(remainingMs / 1000);
    timeEl.innerHTML =
      `<span class="label">${strings.t('headerTime')}</span>` +
      strings.t('timeDisplay', { seconds: remainingSec });
  }

  // ---- board DOM ----------------------------------------------------------
  /** Build (or rebuild) the board DOM from the current sim view. Card count
   *  comes from the view's resolved pair count (the engine is authoritative);
   *  the grid layout (cols) comes from the display ladder. */
  function buildBoard(v: SimView): void {
    // Remove old grid.
    const existing = stage.querySelector('.lm-grid');
    if (existing) existing.remove();

    const level = memoryConfig.levels[currentIndex]!;
    const grid = doc.createElement('div');
    grid.className = 'lm-grid';
    grid.style.gridTemplateColumns = `repeat(${level.cols}, max-content)`;
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', strings.t('ariaBoard'));

    cells = [];
    const cardCount = v.pairs * 2;
    for (let i = 0; i < cardCount; i++) {
      const cell = doc.createElement('button');
      cell.type = 'button';
      cell.className = 'lm-cell';
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', strings.t('ariaCard', { index: i + 1 }));
      cell.setAttribute('aria-pressed', 'false');
      cell.dataset['flipped'] = 'false';
      cell.dataset['matched'] = 'false';
      cell.dataset['index'] = String(i);
      // Front face SVG is determined by the card's leaf kind from simState.
      const kind = simState.cards[i]?.kind ?? 0;
      const leafId = LEAF_IDS[kind] ?? LEAF_IDS[0]!;
      const svg = leafSvgs[leafId] ?? '';
      cell.innerHTML =
        `<span class="lm-face lm-back" aria-hidden="true">?</span>` +
        `<span class="lm-face lm-front" aria-hidden="true">${svg}</span>`;
      grid.appendChild(cell);
      cells.push(cell);
    }

    grid.addEventListener('click', onGridClick);
    grid.addEventListener('keydown', onGridKeyDown);
    stage.appendChild(grid);
    applyCellSize();
  }

  function syncCellsToView(v: SimView): void {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const card = v.cards[i];
      if (!card) continue;
      const flipped =
        card.matched ||
        i === v.firstPick ||
        i === v.secondPick;
      cell.dataset['flipped'] = String(flipped);
      cell.dataset['matched'] = String(card.matched);
      cell.setAttribute('aria-pressed', String(flipped));
      cell.disabled = card.matched;
    }
  }

  function revealAllCells(): void {
    for (const cell of cells) {
      cell.dataset['flipped'] = 'true';
      cell.setAttribute('aria-pressed', 'true');
    }
  }

  function coverUnmatchedCells(): void {
    const v = viewOf(simState);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const card = v.cards[i];
      if (!card || card.matched) continue;
      cell.dataset['flipped'] = 'false';
      cell.setAttribute('aria-pressed', 'false');
    }
  }

  // ---- input --------------------------------------------------------------
  function onGridClick(e: MouseEvent): void {
    if (status !== 'playing') return;
    const target = (e.target as HTMLElement | null)?.closest('button.lm-cell') as HTMLButtonElement | null;
    if (!target) return;
    const idx = Number(target.dataset['index']);
    if (!Number.isFinite(idx)) return;
    // The reducer's step() ignores the click if the board is busy (flip-back
    // countdown > 0) or the card is already matched/firstPick. We still push
    // the input and record it - the reducer is the authority on whether it
    // causes a state change.
    inputQueue.push({ cardIndex: idx });
  }

  function focusNeighbor(from: number, delta: number): void {
    const next = (from + delta + cells.length) % cells.length;
    cells[next]?.focus();
  }

  function onGridKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const idx = Number(target?.dataset?.['index']);
    if (!Number.isFinite(idx)) return;
    const level = memoryConfig.levels[currentIndex];
    if (!level) return;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); focusNeighbor(idx, 1); break;
      case 'ArrowLeft':  e.preventDefault(); focusNeighbor(idx, -1); break;
      case 'ArrowDown':  e.preventDefault(); focusNeighbor(idx, level.cols); break;
      case 'ArrowUp':    e.preventDefault(); focusNeighbor(idx, -level.cols); break;
    }
  }

  let inputQueue: SimAction[] = [];

  // ---- fixed-step loop ----------------------------------------------------
  function advanceOneTick(): void {
    const acts = inputQueue;
    inputQueue = [];
    for (const a of acts) {
      simState = engine.step(simState, a);
      recorded.push({ tick: logicalTick, action: a });
    }
    simState = engine.tick(simState);
    logicalTick++;

    const v = viewOf(simState);
    syncCellsToView(v);
    renderTime(v);

    if (v.allMatched) {
      onRoundCleared(v);
    } else if (v.timedOut) {
      onTimeout();
    }
  }

  function frame(): void {
    if (disposed) return;
    const tMs = now();
    let dt = lastMs === null ? 0 : (tMs - lastMs) / 1000;
    lastMs = tMs;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

    if (status === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_TIMESTEP_MS / 1000 && steps < MAX_STEPS_PER_FRAME && status === 'playing') {
        advanceOneTick();
        acc -= FIXED_TIMESTEP_MS / 1000;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0; // drop backlog after stall
    }

    rafHandle = raf(frame);
  }

  // ---- state transitions --------------------------------------------------
  function clearStage(): void {
    // Stop any pending peek timeout.
    if (peekTimeoutId !== null) {
      clearTimeout(peekTimeoutId);
      peekTimeoutId = null;
    }
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    while (actions.firstChild) actions.removeChild(actions.firstChild);
    cells = [];
    inputQueue = [];
  }

  function showStart(): void {
    status = 'waiting';
    clearStage();
    currentLevel = null;
    renderLevel(null);
    renderTime(null);
    renderBest();

    const screen = renderStartScreen(doc, strings, () => {
      currentIndex = memoryConfig.startIndex;
      startRound();
    });
    stage.appendChild(screen);
    const btn = screen.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  function showWin(score: number, newBest: boolean): void {
    status = 'over';
    clearStage();
    renderTime(null);
    renderBest();

    const onHarder =
      currentIndex < memoryConfig.levels.length - 1
        ? () => { currentIndex += 1; startRound(); }
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
    const btn = screen.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  function showLoss(): void {
    status = 'over';
    clearStage();
    renderTime(null);
    renderBest();

    const onEasier =
      currentIndex > 0
        ? () => { currentIndex -= 1; startRound(); }
        : null;

    const screen = renderLossScreen(doc, strings, {
      onRetry: () => startRound(),
      onEasier,
    });
    stage.appendChild(screen);
    const btn = screen.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  function startRound(): void {
    clearStage();
    const level = memoryConfig.levels[currentIndex]!;
    currentLevel = level;

    // Init the reducer with the server seed + the RAW dashboard config pinned
    // to this round's level. The engine owns the config->sim transform, so the
    // replay (running the same engine.init over the same raw config) matches.
    simState = engine.init({ seed, config: rawConfigForLevel(currentIndex) });
    recorded = [];
    logicalTick = 0;
    acc = 0;
    lastMs = null;
    inputQueue = [];

    const initialView = viewOf(simState);
    renderLevel(level);
    renderTime(initialView);
    renderBest();

    // Build board DOM from the initial view (cards are face-down).
    buildBoard(initialView);

    const peekMs = peekMsOverride ?? level.peekMs;
    const reducedMotion = prefersReducedMotion(view);
    if (reducedMotion || peekMs <= 0) {
      // Skip the peek phase: go directly to playing.
      announcer.say(strings.t('announceRoundStarted'));
      status = 'playing';
      return;
    }

    // Peek (memorize) phase: reveal all cards, wait peekMs, then cover.
    status = 'peeking';
    revealAllCells();
    announcer.say(strings.t('announceMemorize'));

    function endPeek(): void {
      if (peekTimeoutId === null) return; // already ended
      clearTimeout(peekTimeoutId);
      peekTimeoutId = null;
      if (disposed) return;
      const grid = stage.querySelector('.lm-grid');
      if (grid) grid.removeEventListener('click', endPeekOnClick);
      coverUnmatchedCells();
      announcer.say(strings.t('announceRoundStarted'));
      status = 'playing';
    }

    function endPeekOnClick(): void {
      endPeek();
    }

    const grid = stage.querySelector('.lm-grid');
    if (grid) grid.addEventListener('click', endPeekOnClick);
    peekTimeoutId = setTimeout(endPeek, peekMs);
  }

  function onRoundCleared(v: SimView): void {
    if (status !== 'playing') return;
    status = 'over';
    // Score: difficulty x remaining seconds. difficulty = pairs / 2, read from
    // the view so the live score matches the engine's resolved board.
    const difficulty = v.pairs / 2;
    const remainingSec = Math.max(0, (v.budgetTicks - v.ticksElapsed) * FIXED_TIMESTEP_MS / 1000);
    const s = Math.round(difficulty * remainingSec);

    const isNewBest = bestScore === null || s > bestScore;
    if (isNewBest) {
      bestScore = s;
      bridge.pass({ trace: encodeTrace(recorded) });
    }
    announcer.say(strings.t('announceRoundPassed'));
    showWin(s, isNewBest);
  }

  function onTimeout(): void {
    if (status !== 'playing') return;
    status = 'over';
    announcer.say(strings.t('announceOutOfTime'));
    showLoss();
  }

  // ---- boot ---------------------------------------------------------------
  showStart();
  renderBest();
  rafHandle = raf(frame);

  // ---- cleanup ------------------------------------------------------------
  return function cleanup(): void {
    disposed = true;
    caf(rafHandle);
    if (peekTimeoutId !== null) {
      clearTimeout(peekTimeoutId);
      peekTimeoutId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    root.remove();
  };
}
