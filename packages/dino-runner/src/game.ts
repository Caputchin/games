// Orchestrates Dino Runner: builds the DOM shell, runs the requestAnimation-
// Frame loop, wires input, and drives the state machine (waiting -> running
// -> crashed -> running). Physics live in engine.ts / obstacles.ts /
// horizon.ts; this module is the glue + rendering + the pass gate.
//
// Pass gate (mirrors fruit-slash): bridge.pass fires the moment the live
// score reaches `passScore` mid-run (markVerified, once per session) so the
// captcha is satisfied immediately and the visitor can keep running for a
// higher score. It fires again at crash time for any run that beats the best
// score already passed (scoring.evaluatePass). Best score and the `verified`
// latch are in-memory only (the iframe is sandbox="allow-scripts", an opaque
// origin), so localStorage is unavailable.

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
import { advanceSpeed } from './progression.js';
import { createSfx } from './audio.js';
import { SOUND_CLIPS } from './sounds.js';
import { STYLES } from './styles.js';
import { WORLD_WIDTH, WORLD_HEIGHT, MS_PER_FRAME } from './constants.js';
import { renderStartScreen, renderGameOverScreen } from './screens.js';

/** Score interval between milestone chimes. */
const SCORE_MILESTONE = 100;

// Skin color keys consumed as CSS custom properties: each `foo_bar` becomes
// `--dr-foo-bar`. Asset (sprite_*) keys are handled by resolveSprites.
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
  const sfx = createSfx(view, cfg.sound, SOUND_CLIPS);

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
  // Light vs dark is a fixed skin choice for the session, not an in-game
  // cycle. The dark skin also shows a night sky (moon + stars).
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
  // The in-game sound toggle only exists when sound is enabled by config.
  const soundBtn = cfg.sound ? buildSoundButton() : null;
  const overlay = el('div', 'dr-overlay-host');

  world.append(skyNight, skyDay, groundLayer, obstacleLayer, runnerEl, hud.root);
  // The overlay (start / game-over screen) lives on the STAGE, not the World:
  // the World is letterboxed + scaled to a fixed 600x150 box, so an overlay
  // inside it would only cover the game rect, not the full iframe when the
  // embed's aspect differs (e.g. full-width). On the stage it always fills the
  // embed. `.dr-overlay` (inset:0) resolves against the positioned stage.
  // Invariant: `.dr-overlay-host` must stay UNpositioned (no CSS position) so
  // the containing-block walk passes through it to the stage; giving it a
  // position would silently re-scope the overlay to the host's box.
  stage.append(world, overlay);
  // Sound toggle is appended to the stage AFTER the overlay, so it stays
  // visible + clickable on top of the start / game-over screen (always on top).
  if (soundBtn) stage.appendChild(soundBtn);

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
  let verified = false; // pass threshold reached; bridge.pass fired once
  let muted = false;
  let runElapsedMs = 0;
  let lastMilestone = 0;
  let lastTs: number | null = null;
  let rafHandle = 0;
  let disposed = false;
  let scale = 1;

  const obstacleEls = new Map<ActiveObstacle, HTMLElement>();
  const cloudEls: HTMLElement[] = [];
  const starEls: HTMLElement[] = [];
  // Moon only exists in the dark skin's night sky.
  const moonEl = nightSky ? scenerySprite('moon') : null;
  if (moonEl) {
    moonEl.classList.add('dr-moon');
    // Square box (matches the moon's square viewBox so the crescent isn't
    // distorted); sized well above the 9px stars so the moon clearly reads as
    // the dominant night-sky element.
    sizeEntity(moonEl, 40, 40);
    skyNight.appendChild(moonEl);
  }

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
  // The first input is the user gesture that unlocks the AudioContext.
  function jumpPressed(): void {
    sfx.resume();
    if (status === 'waiting') startRun();
    else if (status === 'running') doJump();
    else if (status === 'crashed') restart();
  }
  function doJump(): void {
    if (status !== 'running') return;
    runner.startJump(speed);
    sfx.jump();
  }
  function duck(down: boolean): void {
    if (down) sfx.resume();
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
    // Releasing the jump key cuts the jump short (variable jump).
    else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') runner.endJump();
  }
  function onStagePointer(e: PointerEvent): void {
    // Pointer/tap on the field jumps mid-run; start + restart go through the
    // overlay buttons so a tap can't skip them.
    sfx.resume();
    if (status === 'running') {
      e.preventDefault();
      doJump();
    }
  }

  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  stage.addEventListener('pointerdown', onStagePointer);
  // A short tap ends the jump early; holding keeps the full arc.
  stage.addEventListener('pointerup', () => runner.endJump());
  touch.jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx.resume();
    doJump();
  });
  touch.jump.addEventListener('pointerup', () => runner.endJump());
  touch.jump.addEventListener('pointercancel', () => runner.endJump());
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
    lastMilestone = 0;
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
    startRun();
  }

  // Report success once the live score reaches the pass threshold, then keep
  // running. A Verified badge shows in the HUD; gameOver() resends the final
  // score if it beats this. `verified` is a session latch (the badge persists
  // across restarts), since a Dino session is one continuous endless run set.
  function markVerified(score: number): void {
    verified = true;
    bestPassed = score; // first pass; high-water mark for the crash resend
    bridge.pass({ score, durationMs: Math.round(runElapsedMs) });
    announcer.say(strings.t('announceVerified', { score }));
    renderHud();
  }

  function gameOver(): void {
    status = 'crashed';
    runner.crash();
    sfx.hit();
    touch.root.dataset['active'] = 'false';
    const score = toScore(distanceRan);
    const isNewBest = score > bestScore;
    if (isNewBest) bestScore = score;

    // Resend the final score if this run beat the best already passed (the
    // mid-run verify reported the threshold score; the visitor may have run
    // further since). The widget keeps the highest score reached.
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

  // ---- simulation ------------------------------------------------------
  function step(dtMs: number): void {
    runElapsedMs += dtMs;
    const frames = dtMs / MS_PER_FRAME;
    distanceRan += speed * frames;
    speed = advanceSpeed(speed, cfg.maxSpeed, cfg.acceleration, frames);

    runner.update(dtMs, speed);
    obstacles.update(dtMs, speed, cfg);
    horizon.update(dtMs, speed, reducedMotion);

    const score = toScore(distanceRan);
    if (score > bestScore) bestScore = score;
    // Milestone chime every SCORE_MILESTONE points.
    const milestone = Math.floor(score / SCORE_MILESTONE);
    if (milestone > lastMilestone) {
      lastMilestone = milestone;
      sfx.score();
    }
    // Captcha is satisfied the instant the run reaches the pass threshold.
    if (!verified && score >= cfg.passScore) markVerified(score);

    if (hasCollision()) {
      gameOver();
    }
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
    // Stars + moon only render in the dark skin's night sky.
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
  function buildHud(): { root: HTMLElement; best: HTMLElement; score: HTMLElement; badge: HTMLElement } {
    const rootEl = el('div', 'dr-hud');
    const badge = el('span', 'dr-badge');
    badge.dataset['hidden'] = 'true';
    const best = el('span', 'dr-hud-best');
    const score = el('span', 'dr-hud-score');
    rootEl.append(badge, best, score);
    return { root: rootEl, best, score, badge };
  }
  // In-game sound toggle: an accessible switch that mutes / unmutes the audio
  // engine at runtime. aria-checked = sound ON.
  function buildSoundButton(): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dr-sound';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label', strings.t('ariaSound'));
    btn.innerHTML = sprites['sound-on'];
    // Keep a tap on the toggle from bubbling to the stage's jump handler.
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
    sfx.dispose();
    root.remove();
  };
}
