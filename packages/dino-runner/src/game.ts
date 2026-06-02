// Orchestrates Dino Runner LIVE play. The authoritative game logic
// is the headless reducer in sim/engine; this module is the live DRIVER +
// renderer around it: it builds the DOM shell, runs a FIXED-STEP accumulator
// loop that advances the reducer one logical tick at a time, records jump/duck
// inputs tick-stamped as the opaque trace (encodeTrace), and renders the
// reducer's view projection. Because the live driver and the server replay run
// the SAME reducer over the SAME recorded ticks, the live score equals the
// replayed verdict by construction.
//
// What lives HERE (render-only, never in the verdict): the DOM chrome, obstacle
// node pool, horizon/scenery, audio, and accessibility announcements. These may
// use real time / Math.random freely - they never touch the sim. What crosses to
// the server is only the recorded trace; the seed comes from `ctx.seed`.

import type { Bridge, GameContext, Seed } from '@caputchin/game-sdk';
import { encodeTrace, type TickInput } from '@caputchin/engine-runtime';
import { engine, toScore } from './sim/engine.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './sim/constants.js';
import type { SimAction, SimRunner, SimObstacle } from './sim/types.js';
import { Runner, runnerCollisionOrigin } from './engine.js';
import { ObstacleManager, obstacleTiles, type ActiveObstacle } from './obstacles.js';
import { Horizon } from './horizon.js';
import { resolveDinoConfig } from './config.js';
import { resolveSprites, type SpriteId } from './sprites.js';
import { buildStrings } from './strings.js';
import { cjkFontStack } from './fonts.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { createSfx } from './audio.js';
import { SOUND_CLIPS } from './sounds.js';
import { STYLES } from './styles.js';
import { renderStartScreen, renderGameOverScreen } from './screens.js';

// Score interval between milestone chimes.
const SCORE_MILESTONE = 100;

// Skin color keys consumed as CSS custom properties.
const SKIN_COLOR_KEYS: readonly string[] = [
  'bg',
  'fg',
  'button_bg',
  'button_text',
  'button_hover',
  'button_secondary_text',
  'button_secondary_border',
  'button_secondary_hover_bg',
  'focus_ring',
];

type DriverStatus = 'waiting' | 'running' | 'crashed';

// After a tab stall we cap one frame's real delta; the logical ticks that ran
// stay in the recorded trace, so replay reproduces them either way.
const MAX_FRAME_DT = 0.1;
const MAX_STEPS_PER_FRAME = 10;

// Fixed logical timestep in seconds (must match sim/constants.ts STEP_S).
const STEP_S = 0.016;

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  /** Injectable for tests; default to the view's rAF/caf. */
  raf?: (cb: (ts: number) => void) => number;
  caf?: (handle: number) => void;
}

/** Build a throwaway seed for a no-verify mount (no server seed issued). */
function randomSeed(): Seed {
  const u = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;
  return [u(), u(), u(), u()];
}

export function runDinoRunner(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);

  const strings = buildStrings(ctx?.locale);
  const sprites = resolveSprites(ctx?.skin ?? null);
  // The RAW dashboard config. The display resolver below derives presentation
  // fields (sound, showScore, showBest) + the pass threshold for the live
  // resend check; the engine resolves the SAME raw object into its SimConfig.
  const rawConfig = (ctx?.config ?? null) as Record<string, unknown> | null;
  const cfg = resolveDinoConfig(rawConfig);
  const reducedMotion = prefersReducedMotion(view);
  const sfx = createSfx(view, cfg.sound, SOUND_CLIPS);

  if (!doc.getElementById('dr-styles')) {
    const style = doc.createElement('style');
    style.id = 'dr-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  // Per-round seed: server-issued (replayable) or a driver-side random.
  const seed: Seed = ctx?.seed ?? randomSeed();

  // ---- DOM shell -------------------------------------------------------
  const root = el('div', 'dr-root');
  root.setAttribute('lang', strings.lang);
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', strings.t('ariaGame'));
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  const skinTheme = ctx?.skin?._theme === 'dark' ? 'dark' : 'light';
  const nightSky = skinTheme === 'dark';
  root.dataset['theme'] = skinTheme;
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
  const soundBtn = cfg.sound ? buildSoundButton() : null;
  const overlay = el('div', 'dr-overlay-host');

  world.append(skyNight, skyDay, groundLayer, obstacleLayer, runnerEl, hud.root);
  stage.append(world, overlay);
  if (soundBtn) stage.appendChild(soundBtn);

  const announcer = createAnnouncer(doc);
  root.append(stage, announcer.element);
  container.appendChild(root);

  // Touch devices have no on-screen buttons: tapping the stage jumps (see
  // onStagePointer). Drives the start-screen control hint (tap vs keyboard).
  const isTouch = typeof view.matchMedia === 'function' && view.matchMedia('(pointer: coarse)').matches;

  // ---- render-only state (not in the sim) ------------------------------
  // These objects are RENDER-ONLY drivers - they do NOT affect the verdict.
  // The sim drives the authoritative runner/obstacle state; these mirror the
  // view projection for DOM rendering and horizon/scenery only.
  const renderRunner = new Runner(cfg);
  const renderObstacles = new ObstacleManager(); // render-only mirror
  const horizon = new Horizon();
  const obstacleEls = new Map<ActiveObstacle, HTMLElement>();
  const cloudEls: HTMLElement[] = [];
  const starEls: HTMLElement[] = [];
  const moonEl = nightSky ? scenerySprite('moon') : null;
  if (moonEl) {
    moonEl.classList.add('dr-moon');
    sizeEntity(moonEl, 40, 40);
    skyNight.appendChild(moonEl);
  }

  // ---- driver state ---------------------------------------------------
  let driverStatus: DriverStatus = 'waiting';
  let simState = engine.init({ seed, config: rawConfig });
  let recorded: TickInput<SimAction>[] = [];
  let logicalTick = 0;
  let acc = 0;
  let lastMs: number | null = null;
  let verified = false;
  let bestScore = 0;
  let bestPassed = -1;
  let muted = false;
  let lastMilestone = 0;
  let disposed = false;
  let scale = 1;
  let rafHandle = 0;

  // Queued inputs since the last logical tick.
  let inputQueue: SimAction[] = [];

  // ---- responsiveness --------------------------------------------------
  function recomputeScale(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    scale = Math.min(rect.width / WORLD_WIDTH, rect.height / WORLD_HEIGHT);
    root.style.setProperty('--dr-scale', String(scale));
    // Drive the responsive start / game-over overlay off the stage height so
    // the copy never overflows a short embed. Dino is a thin strip (a tall
    // embed is rare), so the buckets sit low: the overlay drops to title + the
    // essential line + button as the height shrinks.
    const h = rect.height;
    root.dataset['size'] = h >= 220 ? 'lg' : h >= 150 ? 'md' : 'xs';
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
  // Input handlers queue DISCRETE actions. The fixed-step loop applies them
  // tick-stamped so the exact logical tick is recorded for replay.
  function onJumpPress(): void {
    sfx.resume();
    if (driverStatus === 'crashed') { restart(); return; }
    inputQueue.push({ k: 'jump_press' });
    if (driverStatus === 'waiting') {
      // Immediately start run (the sim.step will flip status to 'running').
      driverStatus = 'running';
      startRun();
    } else {
      sfx.jump();
    }
  }
  function onJumpRelease(): void {
    inputQueue.push({ k: 'jump_release' });
  }
  function onDuckPress(): void {
    sfx.resume();
    inputQueue.push({ k: 'duck_press' });
  }
  function onDuckRelease(): void {
    inputQueue.push({ k: 'duck_release' });
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) onJumpPress();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (!e.repeat) onDuckPress();
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') onDuckRelease();
    else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') onJumpRelease();
  }
  function onStagePointer(e: PointerEvent): void {
    sfx.resume();
    if (driverStatus === 'running') {
      e.preventDefault();
      onJumpPress();
    } else if (driverStatus === 'waiting') {
      onJumpPress();
    }
  }

  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  stage.addEventListener('pointerdown', onStagePointer);
  stage.addEventListener('pointerup', onJumpRelease);

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    overlay.replaceChildren(renderStartScreen(doc, strings, () => onJumpPress(), isTouch));
    focusOverlayButton();
  }

  function startRun(): void {
    overlay.replaceChildren();
    lastMilestone = 0;
    announcer.say(strings.t('announceStart'));
    // Sync the render-only runner into 'running' state.
    renderRunner.start();
    renderAll();
  }

  function restart(): void {
    simState = engine.init({ seed, config: rawConfig });
    recorded = [];
    logicalTick = 0;
    acc = 0;
    lastMs = null;
    inputQueue = [];
    driverStatus = 'waiting';
    lastMilestone = 0;

    // Reset render-only objects.
    renderRunner.reset();
    renderObstacles.reset();
    obstacleEls.forEach((node) => node.remove());
    obstacleEls.clear();
    horizon.reset();

    // Start immediately on restart.
    driverStatus = 'running';
    inputQueue.push({ k: 'jump_press' });
    startRun();
  }

  function onVerified(score: number): void {
    verified = true;
    bestPassed = score;
    bridge.pass({ trace: encodeTrace(recorded) });
    announcer.say(strings.t('announceVerified', { score }));
    renderHud();
  }

  function onGameOver(score: number): void {
    driverStatus = 'crashed';
    renderRunner.crash();
    sfx.hit();

    const isNewBest = score > bestScore;
    if (isNewBest) bestScore = score;

    // Resend if this run beat the best already passed. passScore comes from the
    // display resolver (same raw config the engine resolves) - this is a
    // live-only resend decision, never the verdict (that's the engine's).
    const qualifies = score >= cfg.passScore && score > bestPassed;
    if (qualifies) {
      bestPassed = score;
      bridge.pass({ trace: encodeTrace(recorded) });
    }

    announcer.say(
      isNewBest
        ? strings.t('announceNewBest', { score })
        : strings.t('announceGameOver', { score }),
    );

    overlay.replaceChildren(
      renderGameOverScreen(doc, strings, {
        won: verified,
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

  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- fixed-step driver ----------------------------------------------
  /** Advance the reducer one logical tick: apply + record queued inputs,
   *  tick the sim, react to new state (HUD, pass, game-over). */
  function advanceOneTick(): void {
    const acts = inputQueue;
    inputQueue = [];
    for (const a of acts) {
      simState = engine.step(simState, a);
      recorded.push({ tick: logicalTick, action: a });
    }
    simState = engine.tick(simState);
    logicalTick++;

    // Sync render-only objects with the sim view for rendering.
    const v = engine.view!(simState);
    syncRenderObjects(v.runner, v.obstacles, v.speed);
    renderAll();

    // Milestone chime.
    const score = toScore(simState.distanceRan);
    if (score > bestScore) bestScore = score;
    const milestone = Math.floor(score / SCORE_MILESTONE);
    if (milestone > lastMilestone) {
      lastMilestone = milestone;
      sfx.score();
    }

    // Pass gate.
    if (!verified && simState.verified) onVerified(score);

    // Game over.
    if (engine.isOver(simState)) {
      onGameOver(score);
    }
  }

  /** Mirror the sim's authoritative runner + obstacle data into the render-only
   *  objects so renderAll() can draw them. The render objects' physics ARE NOT
   *  re-run - we overwrite their position from the sim view directly. This
   *  ensures the rendered position matches the authoritative sim exactly. */
  function syncRenderObjects(runner: SimRunner, obstacles: readonly SimObstacle[], speed: number): void {
    // Sync render runner pose from the sim view. status is public; runFrame +
    // duckFrame use the setters exposed for exactly this purpose.
    renderRunner.y = runner.y;
    renderRunner.status = runner.status;
    renderRunner.setRunFrame(runner.runFrame);
    renderRunner.setDuckFrame(runner.duckFrame);

    // Sync render obstacle pool: add new, remove gone.
    // We don't use ObstacleManager for physics - we just need its obstacle array
    // for the DOM renderer's node pool. Overwrite directly.
    renderObstacles.obstacles.length = 0;
    for (const o of obstacles) {
      renderObstacles.obstacles.push(o as unknown as ActiveObstacle);
    }

    // Advance horizon (render-only: ground scroll + clouds).
    horizon.update(STEP_S * 1000, speed, reducedMotion);
  }

  // ---- rendering -------------------------------------------------------
  function renderAll(): void {
    renderRunnerEl();
    renderObstacleEls();
    renderScenery();
    renderHud();
  }

  function renderRunnerEl(): void {
    const f = renderRunner.frame();
    sizeEntity(runnerEl, f.width, f.height);
    translate(runnerEl, f.x, f.y);
    setSprite(runnerEl, f.sprite);
  }

  function renderObstacleEls(): void {
    const live = new Set(renderObstacles.obstacles);
    for (const [o, node] of obstacleEls) {
      if (!live.has(o)) {
        node.remove();
        obstacleEls.delete(o);
      }
    }
    for (const o of renderObstacles.obstacles) {
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
    if (nightSky) {
      syncPool(starEls, horizon.stars.length, () => {
        const node = scenerySprite('star');
        sizeEntity(node, 9, 9);
        skyNight.appendChild(node);
        return node;
      });
      horizon.stars.forEach((s, i) => translate(starEls[i]!, s.x, s.y));
      if (moonEl) translate(moonEl, horizon.moon.x, horizon.moon.y);
    }
  }

  function renderHud(): void {
    hud.badge.dataset['hidden'] = verified ? 'false' : 'true';
    if (verified) hud.badge.textContent = `✓ ${strings.t('verifiedBadge')}`;
    hud.best.dataset['hidden'] = cfg.showBest ? 'false' : 'true';
    hud.score.dataset['hidden'] = cfg.showScore ? 'false' : 'true';
    if (cfg.showBest) {
      hud.best.innerHTML = `<span class="label">${strings.t('headerBest')}</span>${pad(bestScore)}`;
    }
    if (cfg.showScore) {
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${pad(toScore(simState.distanceRan))}`;
    }
  }

  // ---- loop ------------------------------------------------------------
  function frame(tMs: number): void {
    if (disposed) return;
    let dt = lastMs === null ? 0 : (tMs - lastMs) / 1000;
    lastMs = tMs;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

    if (driverStatus === 'running') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP_S && steps < MAX_STEPS_PER_FRAME && driverStatus === 'running') {
        advanceOneTick();
        acc -= STEP_S;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    } else if (driverStatus === 'waiting') {
      // Render the idle start frame (runner standing, no obstacles).
      renderAll();
    }

    rafHandle = raf(frame);
  }

  // ---- boot ------------------------------------------------------------
  showStart();
  renderAll();
  bridge.setSize(WORLD_WIDTH, WORLD_HEIGHT);
  rafHandle = raf(frame);

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
  function buildHud(): { root: HTMLElement; best: HTMLElement; score: HTMLElement; badge: HTMLElement } {
    const rootEl = el('div', 'dr-hud');
    const badge = el('span', 'dr-badge');
    badge.dataset['hidden'] = 'true';
    const best = el('span', 'dr-hud-best');
    const score = el('span', 'dr-hud-score');
    rootEl.append(badge, best, score);
    return { root: rootEl, best, score, badge };
  }
  function buildSoundButton(): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dr-sound';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label', strings.t('ariaSound'));
    btn.innerHTML = sprites['sound-on'];
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      muted = !muted;
      sfx.resume();
      sfx.setMuted(muted);
      btn.innerHTML = sprites[muted ? 'sound-off' : 'sound-on'];
      btn.setAttribute('aria-checked', muted ? 'false' : 'true');
    });
    return btn;
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
    sfx.dispose();
    root.remove();
  };
}
