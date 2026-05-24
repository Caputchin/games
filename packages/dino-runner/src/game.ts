// Orchestrates Dino Runner: builds the DOM shell, runs the requestAnimation-
// Frame loop, wires input, and drives the state machine (waiting -> running
// -> crashed -> running). Physics live in engine.ts / obstacles.ts /
// horizon.ts; this module is the glue + rendering + the pass gate.
//
// The game is endless, so the pass gate is evaluated at crash time
// (scoring.ts): the first crash that clears `passScore` reports success via
// bridge.pass, and so does every later run that sets a new best. Best score
// is in-memory only — the iframe is sandbox="allow-scripts" (opaque origin),
// so localStorage is unavailable.

import type { Bridge, GameContext } from '@caputchin/game-sdk';
import { Runner, runnerCollisionOrigin } from './engine.js';
import { ObstacleManager, obstacleTiles, type ActiveObstacle } from './obstacles.js';
import { Horizon } from './horizon.js';
import { collides } from './collision.js';
import { resolveDinoConfig, type DinoConfig } from './config.js';
import { resolveSprites, type SpriteId } from './sprites.js';
import { buildStrings } from './strings.js';
import { cjkFontStack } from './fonts.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { toScore, evaluatePass } from './scoring.js';
import { STYLES } from './styles.js';
import { WORLD_WIDTH, WORLD_HEIGHT, MS_PER_FRAME } from './constants.js';
import { renderStartScreen, renderGameOverScreen } from './screens.js';

// Skin color keys consumed as CSS custom properties: each `foo_bar` becomes
// `--dr-foo-bar`. Asset (sprite_*) keys are handled by resolveSprites.
const SKIN_COLOR_KEYS: readonly string[] = [
  'bg',
  'fg',
  'bg_night',
  'fg_night',
  'button_bg',
  'button_text',
  'button_hover',
  'button_secondary_text',
  'button_secondary_border',
  'button_secondary_hover_bg',
  'focus_ring',
];

type Status = 'waiting' | 'running' | 'crashed';

/** Largest delta we honor in one step; after a tab blur the rAF gap can be
 *  huge and we don't want the world to teleport. */
const MAX_STEP_MS = 1000 / 30;

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  /** Injectable for tests; defaults to the view's rAF/caf. */
  raf?: (cb: (ts: number) => void) => number;
  caf?: (handle: number) => void;
}

export function runDinoRunner(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);

  const strings = buildStrings(ctx?.locale);
  const sprites = resolveSprites(ctx?.skin ?? null);
  const cfg = resolveDinoConfig(ctx);
  const reducedMotion = prefersReducedMotion(view);

  if (!doc.getElementById('dr-styles')) {
    const style = doc.createElement('style');
    style.id = 'dr-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  // ---- DOM shell -------------------------------------------------------
  const root = el('div', 'dr-root');
  root.setAttribute('lang', strings.lang);
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', strings.t('ariaGame'));
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  root.dataset['phase'] = 'day';
  applySkin(root, ctx);
  const cjk = cjkFontStack(strings.lang);
  if (cjk) root.style.setProperty('--dr-cjk', cjk);

  const stage = el('div', 'dr-stage');
  const world = el('div', 'dr-world');
  const skyDay = el('div', 'dr-sky-day');
  const skyNight = el('div', 'dr-sky-night');
  const groundLayer = el('div', 'dr-ground-layer');
  const groundA = groundTile();
  const groundB = groundTile();
  groundLayer.append(groundA, groundB);
  const obstacleLayer = el('div', 'dr-obstacle-layer');
  const runnerEl = el('div', 'dr-entity dr-runner');
  const hud = buildHud();
  const overlay = el('div', 'dr-overlay-host');

  world.append(skyNight, skyDay, groundLayer, obstacleLayer, runnerEl, hud.root, overlay);
  stage.appendChild(world);

  const touch = buildTouchControls();

  const announcer = createAnnouncer(doc);
  root.append(stage, touch.root, announcer.element);
  container.appendChild(root);

  // ---- game state ------------------------------------------------------
  const runner = new Runner(cfg);
  const obstacles = new ObstacleManager();
  const horizon = new Horizon();
  let status: Status = 'waiting';
  let speed = cfg.startSpeed;
  let distanceRan = 0;
  let bestScore = 0;
  let bestPassed = -1;
  let runElapsedMs = 0;
  let lastTs: number | null = null;
  let rafHandle = 0;
  let disposed = false;
  let scale = 1;

  const obstacleEls = new Map<ActiveObstacle, HTMLElement>();
  const cloudEls: HTMLElement[] = [];
  const starEls: HTMLElement[] = [];
  const moonEl = scenerySprite('moon');
  moonEl.classList.add('dr-moon');
  sizeEntity(moonEl, 20, 40);
  skyNight.appendChild(moonEl);

  // ---- responsiveness --------------------------------------------------
  function recomputeScale(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    scale = Math.min(rect.width / WORLD_WIDTH, rect.height / WORLD_HEIGHT);
    root.style.setProperty('--dr-scale', String(scale));
  }
  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => {
      if (!disposed) recomputeScale();
    });
    resizeObserver.observe(stage);
  }
  recomputeScale();

  // ---- input -----------------------------------------------------------
  function jumpPressed(): void {
    if (status === 'waiting') startRun();
    else if (status === 'running') runner.startJump(speed);
    else if (status === 'crashed') restart();
  }
  function duck(down: boolean): void {
    if (status === 'running') runner.setDuck(down);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) jumpPressed();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      duck(true);
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') duck(false);
  }
  function onStagePointer(e: PointerEvent): void {
    // Pointer/tap on the field jumps mid-run; start + restart go through the
    // overlay buttons so a tap can't skip them.
    if (status === 'running') {
      e.preventDefault();
      runner.startJump(speed);
    }
  }

  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  stage.addEventListener('pointerdown', onStagePointer);
  touch.jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (status === 'running') runner.startJump(speed);
  });
  touch.duck.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    duck(true);
  });
  touch.duck.addEventListener('pointerup', () => duck(false));
  touch.duck.addEventListener('pointercancel', () => duck(false));

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    overlay.replaceChildren(renderStartScreen(doc, strings, startRun));
    touch.root.dataset['active'] = 'false';
    focusOverlayButton();
  }

  function startRun(): void {
    overlay.replaceChildren();
    status = 'running';
    runner.start();
    runElapsedMs = 0;
    touch.root.dataset['active'] = 'true';
    announcer.say(strings.t('announceStart'));
  }

  function restart(): void {
    runner.reset();
    obstacles.reset();
    horizon.reset();
    obstacleEls.forEach((node) => node.remove());
    obstacleEls.clear();
    speed = cfg.startSpeed;
    distanceRan = 0;
    setPhase('day');
    startRun();
  }

  function gameOver(): void {
    status = 'crashed';
    runner.crash();
    touch.root.dataset['active'] = 'false';
    const score = toScore(distanceRan);
    const isNewBest = score > bestScore;
    if (isNewBest) bestScore = score;

    const decision = evaluatePass(score, cfg.passScore, bestPassed);
    if (decision.pass) {
      bestPassed = decision.bestPassed;
      bridge.pass({ score: decision.score, durationMs: Math.round(runElapsedMs) });
    }

    announcer.say(
      isNewBest
        ? strings.t('announceNewBest', { score })
        : strings.t('announceGameOver', { score }),
    );

    overlay.replaceChildren(
      renderGameOverScreen(doc, strings, {
        score,
        best: bestScore,
        showBest: cfg.showBest,
        restartIcon: sprites.restart,
        onRestart: restart,
      }),
    );
    renderAll();
    focusOverlayButton();
  }

  function setPhase(phase: 'day' | 'night'): void {
    root.dataset['phase'] = phase;
  }

  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- simulation ------------------------------------------------------
  function step(dtMs: number): void {
    runElapsedMs += dtMs;
    const frames = dtMs / MS_PER_FRAME;
    distanceRan += speed * frames;
    if (speed < cfg.maxSpeed) speed = Math.min(cfg.maxSpeed, speed + cfg.acceleration * frames);

    runner.update(dtMs, speed);
    obstacles.update(dtMs, speed, cfg);
    horizon.update(dtMs, speed, reducedMotion);

    updatePhase();

    const score = toScore(distanceRan);
    if (score > bestScore) bestScore = score;

    if (hasCollision()) {
      gameOver();
    }
  }

  function updatePhase(): void {
    if (!cfg.nightMode) {
      setPhase('day');
      return;
    }
    const cycle = Math.floor(distanceRan / cfg.nightDistance);
    setPhase(cycle % 2 === 1 ? 'night' : 'day');
  }

  function hasCollision(): boolean {
    const origin = runnerCollisionOrigin(runner);
    for (const o of obstacles.obstacles) {
      // Only bother with obstacles overlapping the runner's X span.
      if (o.x > origin.x + 60 || o.x + o.width < origin.x - 10) continue;
      if (collides(origin, { x: o.x, y: o.y, boxes: o.boxes })) return true;
    }
    return false;
  }

  // ---- rendering -------------------------------------------------------
  function renderAll(): void {
    renderRunner();
    renderObstacles();
    renderScenery();
    renderHud();
  }

  function renderRunner(): void {
    const f = runner.frame();
    sizeEntity(runnerEl, f.width, f.height);
    translate(runnerEl, f.x, f.y);
    setSprite(runnerEl, f.sprite);
  }

  function renderObstacles(): void {
    const live = new Set(obstacles.obstacles);
    for (const [o, node] of obstacleEls) {
      if (!live.has(o)) {
        node.remove();
        obstacleEls.delete(o);
      }
    }
    for (const o of obstacles.obstacles) {
      let node = obstacleEls.get(o);
      if (!node) {
        node = el('div', 'dr-entity dr-obstacle');
        sizeEntity(node, o.width, o.height);
        node.innerHTML = obstacleHtml(o);
        node.dataset['frame'] = String(o.frame);
        obstacleLayer.appendChild(node);
        obstacleEls.set(o, node);
      } else if (o.typeId === 'bird' && node.dataset['frame'] !== String(o.frame)) {
        node.innerHTML = obstacleHtml(o);
        node.dataset['frame'] = String(o.frame);
      }
      translate(node, o.x, o.y);
    }
  }

  function obstacleHtml(o: ActiveObstacle): string {
    return obstacleTiles(o)
      .map(
        (t) =>
          `<span class="dr-tile" style="position:absolute;left:${t.dx}px;top:0;width:${t.width}px;height:${t.height}px">${sprites[t.sprite]}</span>`,
      )
      .join('');
  }

  function renderScenery(): void {
    translate(groundA, horizon.groundX, 0);
    translate(groundB, horizon.groundX + WORLD_WIDTH, 0);
    syncPool(cloudEls, horizon.clouds.length, () => {
      const node = scenerySprite('cloud');
      sizeEntity(node, 46, 14);
      skyDay.appendChild(node);
      return node;
    });
    horizon.clouds.forEach((c, i) => translate(cloudEls[i]!, c.x, c.y));
    syncPool(starEls, horizon.stars.length, () => {
      const node = scenerySprite('star');
      sizeEntity(node, 9, 9);
      skyNight.appendChild(node);
      return node;
    });
    horizon.stars.forEach((s, i) => translate(starEls[i]!, s.x, s.y));
    translate(moonEl, horizon.moon.x, horizon.moon.y);
  }

  function renderHud(): void {
    hud.best.dataset['hidden'] = cfg.showBest ? 'false' : 'true';
    hud.score.dataset['hidden'] = cfg.showScore ? 'false' : 'true';
    if (cfg.showBest) {
      hud.best.innerHTML = `<span class="label">${strings.t('headerBest')}</span>${pad(bestScore)}`;
    }
    if (cfg.showScore) {
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${pad(toScore(distanceRan))}`;
    }
  }

  // ---- loop ------------------------------------------------------------
  function tick(ts: number): void {
    if (disposed) return;
    const dt = lastTs === null ? 0 : Math.min(MAX_STEP_MS, ts - lastTs);
    lastTs = ts;
    if (status === 'running' && dt > 0) step(dt);
    if (status !== 'crashed') renderAll();
    rafHandle = raf(tick);
  }

  // ---- boot ------------------------------------------------------------
  showStart();
  renderAll();
  rafHandle = raf(tick);

  // ---- helpers ---------------------------------------------------------
  function el(tag: string, className: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  }
  function groundTile(): HTMLElement {
    const node = el('div', 'dr-ground-tile');
    node.innerHTML = sprites.ground;
    return node;
  }
  function scenerySprite(id: SpriteId): HTMLElement {
    const node = el('div', 'dr-entity');
    node.innerHTML = sprites[id];
    return node;
  }
  function setSprite(node: HTMLElement, id: SpriteId): void {
    if (node.dataset['sprite'] === id) return;
    node.dataset['sprite'] = id;
    node.innerHTML = sprites[id];
  }
  function sizeEntity(node: HTMLElement, w: number, h: number): void {
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
  }
  function translate(node: HTMLElement, x: number, y: number): void {
    node.style.transform = `translate(${x}px, ${y}px)`;
  }
  function syncPool(pool: HTMLElement[], len: number, create: () => HTMLElement): void {
    while (pool.length < len) pool.push(create());
    while (pool.length > len) pool.pop()!.remove();
  }
  function buildHud(): { root: HTMLElement; best: HTMLElement; score: HTMLElement } {
    const rootEl = el('div', 'dr-hud');
    const best = el('span', 'dr-hud-best');
    const score = el('span', 'dr-hud-score');
    rootEl.append(best, score);
    return { root: rootEl, best, score };
  }
  function buildTouchControls(): { root: HTMLElement; jump: HTMLButtonElement; duck: HTMLButtonElement } {
    const rootEl = el('div', 'dr-touch');
    rootEl.dataset['active'] = 'false';
    const duckBtn = doc.createElement('button');
    duckBtn.type = 'button';
    duckBtn.className = 'dr-touch-button dr-touch-duck';
    duckBtn.textContent = strings.t('ariaDuck');
    duckBtn.setAttribute('aria-label', strings.t('ariaDuck'));
    const jumpBtn = doc.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'dr-touch-button dr-touch-jump';
    jumpBtn.textContent = strings.t('ariaJump');
    jumpBtn.setAttribute('aria-label', strings.t('ariaJump'));
    // Duck on the leading side, jump on the trailing side.
    rootEl.append(duckBtn, jumpBtn);
    return { root: rootEl, jump: jumpBtn, duck: duckBtn };
  }
  function pad(n: number): string {
    return String(Math.max(0, n)).padStart(5, '0');
  }
  function applySkin(node: HTMLElement, context: GameContext | undefined): void {
    const palette = context?.skin ?? null;
    if (!palette) return;
    for (const key of SKIN_COLOR_KEYS) {
      const value = palette[key];
      if (typeof value === 'string') {
        node.style.setProperty(`--dr-${key.replace(/_/g, '-')}`, value);
      }
    }
    if (palette._theme) node.dataset['skinTheme'] = palette._theme;
  }

  // ---- cleanup ---------------------------------------------------------
  return function cleanup(): void {
    disposed = true;
    caf(rafHandle);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('keyup', onKeyUp);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    root.remove();
  };
}
