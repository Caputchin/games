// Orchestrates Whack-a-Monkey LIVE play. The authoritative game
// logic is the headless reducer in sim/engine; this module is the live DRIVER
// + renderer around it: it builds the DOM shell, runs a FIXED-STEP loop that
// advances the reducer one logical tick at a time (STEP_S seconds), records
// the tap input as the opaque trace, and renders the reducer's view
// projection. Because the live driver and the server replay run the SAME
// reducer over the SAME recorded ticks, the live score equals the replayed
// verdict by construction.
//
// What lives HERE (render-only, never in the verdict): the canvas + DOM chrome,
// hit particles, score popups, audio, and accessibility announcements. These
// may use real time / Math.random freely - they never touch the sim. What
// crosses to the server is only the recorded tap trace; the seed comes from
// `ctx.seed`.

import type { Bridge, GameContext, Seed } from '@caputchin/game-sdk';
import { encodeTrace, type TickInput } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
import { DEFAULT_SIM_CONFIG } from './sim/config.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  STEP_S,
  MOLE_RADIUS,
  MOLE_HIT_PAD,
  MIN_HIT_SCALE,
  GRID_COLS,
  GRID_ROWS,
  HOLE_COUNT,
  GRID_MARGIN,
} from './sim/constants.js';
import type { SimAction, SimState, SimView } from './sim/types.js';
import { buildStrings } from './strings.js';
import { resolveWhackConfig } from './config.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { pointInCircle, type Vec } from './geometry.js';
import { resolvePalette, type Palette } from './palette.js';
import { loadSprites, loadScenery, type SpriteMap, type SpriteKey, type SceneryArt } from './art.js';
import { renderStartScreen, renderEndScreen } from './screens.js';
import { STYLES } from './styles.js';
import { createSfx } from './audio.js';
import {
  POPUP_TTL,
  POPUP_RISE,
  POPUP_FONT,
  HIT_PARTICLES,
  PARTICLE_GRAVITY,
  DECOY_FLASH_S,
} from './constants.js';

const SKIN_COLOR_KEYS: readonly string[] = [
  'bg', 'fg', 'button_bg', 'button_text', 'button_hover', 'focus_ring',
];

const SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a4.5 4.5 0 0 1 0 7"/></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

// Real-time clamp + catch-up bound: after a tab stall we cap one frame's real
// delta and the logical ticks it spends, so the game pauses rather than
// fast-forwarding. The recorded trace only holds ticks that actually ran.
const MAX_FRAME_DT = 0.1;
const MAX_STEPS_PER_FRAME = 10;

type Status = 'waiting' | 'playing' | 'over';

interface Particle {
  x: number; y: number; vx: number; vy: number; ttl: number; color: string; size: number;
}
interface ScorePopup {
  x: number; y: number; vy: number; text: string; color: string; ttl: number;
}

/** Fixed hole centers for the grid, in world units. */
function computeHoleCenters(): Vec[] {
  const marginX = WORLD_WIDTH * GRID_MARGIN;
  const marginY = WORLD_HEIGHT * GRID_MARGIN;
  const usableW = WORLD_WIDTH - marginX * 2;
  const usableH = WORLD_HEIGHT - marginY * 2;
  const cellW = usableW / GRID_COLS;
  const cellH = usableH / GRID_ROWS;
  const centers: Vec[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      centers.push({
        x: marginX + (col + 0.5) * cellW,
        y: marginY + (row + 0.5) * cellH,
      });
    }
  }
  return centers;
}

// Hole centers in fixed world coords - shared by driver and renderer.
const HOLES: readonly Vec[] = computeHoleCenters();

/** Build a throwaway seed for a no-verify mount. This is DRIVER-side (not
 *  the sim), so Math.random is fine here. */
function randomSeed(): Seed {
  const u = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;
  return [u(), u(), u(), u()];
}

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  raf?: (cb: (ts: number) => void) => number;
  caf?: (handle: number) => void;
  now?: () => number;
}

export function runWhackAMonkey(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);
  const now = opts.now ?? (() => (view.performance?.now ? view.performance.now() : Date.now()));

  const strings = buildStrings(ctx?.locale);
  // Presentation config (sound + HUD toggles). The SIM runs under
  // DEFAULT_SIM_CONFIG so live == replay; these values mirror it.
  const pres = resolveWhackConfig(ctx);
  const palette: Palette = resolvePalette(ctx?.skin ?? null);
  const reducedMotion = prefersReducedMotion(view);
  const sfx = createSfx(view, pres.sound);
  let soundOn = pres.sound;
  // Per-round seed: server-issued (replayable) or driver-side random.
  const seed: Seed = ctx?.seed ?? randomSeed();

  if (!doc.getElementById('wm-styles')) {
    const style = doc.createElement('style');
    style.id = 'wm-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  // ---- DOM shell -------------------------------------------------------
  const root = el('div', 'wm-root');
  root.setAttribute('lang', strings.lang);
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', strings.t('ariaGame'));
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  root.dataset['theme'] = ctx?.skin?._theme === 'dark' ? 'dark' : 'light';
  applySkin(root, ctx);

  const stage = el('div', 'wm-stage');
  const canvas = doc.createElement('canvas');
  canvas.className = 'wm-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', strings.t('ariaGame'));

  const hud = buildHud();
  const overlay = el('div', 'wm-overlay-host');
  const soundBtn = buildSoundButton();
  stage.append(canvas, hud.root, overlay, soundBtn);
  const announcer = createAnnouncer(doc);
  root.append(stage, announcer.element);
  container.appendChild(root);

  const context = canvas.getContext('2d');
  if (!context) {
    bridge.error({ code: 'no-canvas-2d', message: 'Canvas 2D context unavailable' });
    return () => root.remove();
  }
  const c2d = context;

  let sprites: SpriteMap | null = null;
  let scenery: SceneryArt | null = null;
  void loadSprites(doc, ctx?.skin ?? null).then((s) => { if (!disposed) sprites = s; });
  void loadScenery(doc).then((s) => { if (!disposed) scenery = s; });

  const tintCache = new Map<string, HTMLCanvasElement | null>();
  function tinted(img: CanvasImageSource, key: string, color: string): CanvasImageSource | null {
    const ck = `${key}|${color}`;
    const hit = tintCache.get(ck);
    if (hit !== undefined) return hit;
    const w = (img as HTMLImageElement).width || 256;
    const h = (img as HTMLImageElement).height || 256;
    const off = doc.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d');
    if (!o) { tintCache.set(ck, null); return null; }
    o.drawImage(img, 0, 0, w, h);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = color;
    o.fillRect(0, 0, w, h);
    tintCache.set(ck, off);
    return off;
  }

  // ---- driver state ----------------------------------------------------
  let status: Status = 'waiting';
  let simState: SimState = engine.init({ seed, config: DEFAULT_SIM_CONFIG });
  let recorded: TickInput<SimAction>[] = [];
  let logicalTick = 0;
  let acc = 0;
  let lastMs: number | null = null;
  // Tap actions queued since the last logical tick (real-time arrival order).
  let inputQueue: SimAction[] = [];

  let verifiedFired = false;
  let verifiedScore = 0;
  let particles: Particle[] = [];
  let popups: ScorePopup[] = [];
  let decoyFlash = 0;
  let disposed = false;

  // ---- view transform (fixed world -> device px, letterboxed) ----------
  let scale = 1;
  let offX = 0;
  let offY = 0;
  function recomputeSize(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(view.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // Fixed world letterboxed into the canvas - the server has no container,
    // so the world cannot depend on it.
    scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
    offX = (canvas.width - WORLD_WIDTH * scale) / 2;
    offY = (canvas.height - WORLD_HEIGHT * scale) / 2;
    const h = rect.height;
    root.dataset['size'] = h >= 380 ? 'lg' : h >= 180 ? 'md' : 'xs';
  }
  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => { if (!disposed) recomputeSize(); });
    resizeObserver.observe(stage);
  }
  recomputeSize();

  /** Map a pointer event to fixed WORLD coordinates. Recorded coords are
   *  stable across container sizes because the world is fixed. */
  function toWorld(e: { clientX: number; clientY: number }): Vec {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    const deviceX = (e.clientX - rect.left) * sx;
    const deviceY = (e.clientY - rect.top) * sy;
    return { x: (deviceX - offX) / scale, y: (deviceY - offY) / scale };
  }

  // ---- input (queue taps; the fixed-step loop applies + records them) --
  function onPointerDown(e: PointerEvent): void {
    if (status !== 'playing') return;
    e.preventDefault();
    const p = toWorld(e);
    // Pick the hit hole in FIXED world coords. Hit radius scales with scaleY.
    const v: SimView = engine.view!(simState);
    for (const m of v.moles) {
      if (m.phase !== 'up') continue;
      const center = HOLES[m.holeIndex]!;
      const hitR = MOLE_RADIUS * Math.max(MIN_HIT_SCALE, m.scaleY) + MOLE_HIT_PAD;
      if (pointInCircle(p.x, p.y, center.x, center.y, hitR)) {
        inputQueue.push({ holeIndex: m.holeIndex });
        return; // one tap per pointer-down
      }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    status = 'waiting';
    overlay.replaceChildren(renderStartScreen(doc, strings, start));
    focusOverlayButton();
  }
  function start(): void {
    overlay.replaceChildren();
    simState = engine.init({ seed, config: DEFAULT_SIM_CONFIG });
    recorded = [];
    logicalTick = 0;
    acc = 0;
    lastMs = null;
    inputQueue = [];
    verifiedFired = false;
    verifiedScore = 0;
    particles = [];
    popups = [];
    decoyFlash = 0;
    status = 'playing';
    renderHud();
    announcer.say(strings.t('announceStart'));
    sfx.resume();
    canvas.focus();
  }
  function onVerified(): void {
    if (verifiedFired) return;
    verifiedFired = true;
    verifiedScore = simState.goodHits;
    // Captcha satisfied: hand the widget the trace SO FAR. The server replays it
    // to the pass threshold and returns the authoritative verdict. The round
    // keeps running so the player can raise their score.
    bridge.pass({ trace: encodeTrace(recorded) });
    sfx.verify();
    announcer.say(strings.t('announceWin', { score: simState.score }));
    renderHud();
  }
  function onRoundOver(): void {
    if (status === 'over') return;
    status = 'over';
    // If the player beat their verified score after passing, resubmit the longer
    // trace so the server's replayed score reflects the full round.
    if (verifiedFired && simState.goodHits > verifiedScore) {
      bridge.pass({ trace: encodeTrace(recorded) });
    }
    announcer.say(strings.t(verifiedFired ? 'announceWin' : 'announceOver', { score: simState.score }));
    overlay.replaceChildren(
      renderEndScreen(doc, strings, { won: verifiedFired, score: simState.score, onRetry: start }),
    );
    focusOverlayButton();
  }
  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- fixed-step driver ----------------------------------------------
  /** Advance the reducer exactly one logical tick: clear last tick's render
   *  cues, apply + record queued inputs, tick the sim, react to the new state
   *  (fx, HUD, pass, over). */
  function advanceOneTick(): void {
    // Clear before applying actions so step()'s pushFx writes are the ONLY
    // cues visible after this tick - not a mix of this tick and previous ones.
    simState.fx = [];
    const acts = inputQueue;
    inputQueue = [];
    for (const a of acts) {
      simState = engine.step(simState, a);
      recorded.push({ tick: logicalTick, action: a });
    }
    simState = engine.tick(simState);
    logicalTick++;

    // Consume render cues.
    const v: SimView = engine.view!(simState);
    for (const fx of v.fx) {
      if (fx.kind === 'whack') {
        sfx.whack();
        const center = HOLES[fx.holeIndex]!;
        spawnParticles(center.x, center.y, palette.goodTint);
        pushPopup(center.x, center.y, `+${fx.delta ?? 0}`, palette.goodTint);
        announcer.say(strings.t('announceHit', { score: v.score }));
      } else if (fx.kind === 'decoy') {
        sfx.decoy();
        const center = HOLES[fx.holeIndex]!;
        decoyFlash = DECOY_FLASH_S;
        pushPopup(center.x, center.y, `${fx.delta ?? 0}`, palette.decoyFlash);
        announcer.say(strings.t('announceDecoy'));
      } else if (fx.kind === 'level') {
        sfx.level();
        announcer.say(strings.t('announceLevel', { level: v.levelIndex + 1 }));
      }
    }
    renderHud();
    if (v.verified && !verifiedFired) onVerified();
    if (engine.isOver(simState)) onRoundOver();
  }

  function pushPopup(x: number, y: number, text: string, color: string): void {
    popups.push({
      x,
      y: y - MOLE_RADIUS * 0.4,
      vy: reducedMotion ? 0 : -POPUP_RISE,
      text,
      color,
      ttl: POPUP_TTL,
    });
  }

  /** Age render-only particles + popups by real `dt` (cosmetic). */
  function renderStep(dt: number): void {
    for (const p of particles) {
      p.vy += PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
    }
    particles = particles.filter((p) => p.ttl > 0);
    for (const pop of popups) { pop.y += pop.vy * dt; pop.ttl -= dt; }
    popups = popups.filter((p) => p.ttl > 0);
    if (decoyFlash > 0) decoyFlash = Math.max(0, decoyFlash - dt);
  }

  // ---- rendering -------------------------------------------------------
  function render(): void {
    const v: SimView = engine.view!(simState);
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.setTransform(scale, 0, 0, scale, offX, offY);
    drawBackdrop();
    drawDistantFoliage();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (const m of v.moles) {
        if (Math.floor(m.holeIndex / GRID_COLS) === row) drawMole(m);
      }
      drawHedge(row);
    }
    drawForegroundGrass();
    drawParticles();
    drawDecoyFlash();
    drawPopups();
  }

  function drawBackdrop(): void {
    const g = c2d.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    g.addColorStop(0, palette.canopyTop);
    g.addColorStop(1, palette.canopyBottom);
    c2d.fillStyle = g;
    c2d.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  function drawDistantFoliage(): void {
    if (!scenery?.bushA) return;
    const img = tinted(scenery.bushA, 'bushA', palette.foliageDark);
    if (!img) return;
    const y = WORLD_HEIGHT * 0.1;
    const size = MOLE_RADIUS * 2.6;
    for (let x = -size * 0.3; x < WORLD_WIDTH + size; x += size * 0.62) {
      const jx = (frand(x) - 0.5) * size * 0.3;
      c2d.drawImage(img, x + jx - size / 2, y - size / 2, size, size);
    }
  }

  function drawHedge(row: number): void {
    if (!scenery) return;
    const rowCenterY = HOLES[row * GRID_COLS]!.y;
    const baseY = rowCenterY + MOLE_RADIUS * 0.55;
    const size = MOLE_RADIUS * 1.9;
    const step = size * 0.52;
    let i = 0;
    for (let x = -size * 0.4; x < WORLD_WIDTH + size; x += step, i++) {
      const seedN = row * 97 + i;
      const src = frand(seedN) < 0.5 ? scenery.bushA : scenery.bushB;
      if (!src) continue;
      const img = tinted(src, frand(seedN) < 0.5 ? 'bushA' : 'bushB', palette.foliage);
      if (!img) continue;
      const s = size * (0.85 + frand(seedN + 13) * 0.4);
      const jy = (frand(seedN + 7) - 0.5) * size * 0.18;
      c2d.drawImage(img, x - s / 2, baseY - s * 0.62 + jy, s, s);
    }
  }

  function drawForegroundGrass(): void {
    if (!scenery?.grass) return;
    const img = tinted(scenery.grass, 'grass', palette.foliage);
    if (!img) return;
    const size = MOLE_RADIUS * 1.5;
    const y = WORLD_HEIGHT + size * 0.18;
    for (let x = -size * 0.3, i = 0; x < WORLD_WIDTH + size; x += size * 0.7, i++) {
      const jx = (frand(i * 31 + 5) - 0.5) * size * 0.3;
      c2d.drawImage(img, x + jx - size / 2, y - size, size, size);
    }
  }

  function drawMole(m: SimView['moles'][number]): void {
    if (m.scaleY <= 0.01) return;
    const center = HOLES[m.holeIndex]!;
    const baseY = center.y + MOLE_RADIUS * 0.55;
    const vScale = m.scaleY;
    const hScale = reducedMotion ? m.scaleY : Math.sqrt(1 / Math.max(0.05, m.scaleY));
    const w = MOLE_RADIUS * 2 * hScale;
    const h = MOLE_RADIUS * 2 * vScale;
    c2d.save();
    c2d.beginPath();
    c2d.rect(center.x - MOLE_RADIUS * 1.6, center.y - MOLE_RADIUS * 2.6, MOLE_RADIUS * 3.2, baseY - (center.y - MOLE_RADIUS * 2.6));
    c2d.clip();
    const key: SpriteKey = m.kind === 'monkey' ? 'monkey' : 'frog';
    const img = sprites ? sprites[key] : null;
    if (img) {
      c2d.drawImage(img, center.x - w / 2, baseY - h, w, h);
    } else {
      c2d.fillStyle = m.kind === 'monkey' ? '#A16639' : '#3FA34D';
      c2d.beginPath();
      c2d.arc(center.x, baseY - h / 2, (w + h) / 4, 0, Math.PI * 2);
      c2d.fill();
    }
    c2d.restore();
  }

  function drawParticles(): void {
    for (const p of particles) {
      c2d.globalAlpha = Math.max(0, Math.min(1, p.ttl / HIT_PARTICLES.ttl));
      c2d.fillStyle = p.color;
      c2d.beginPath();
      c2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
  }

  function drawDecoyFlash(): void {
    if (decoyFlash <= 0) return;
    c2d.globalAlpha = Math.min(0.4, (decoyFlash / DECOY_FLASH_S) * 0.4);
    c2d.fillStyle = palette.decoyFlash;
    c2d.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    c2d.globalAlpha = 1;
  }

  function drawPopups(): void {
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    c2d.font = `700 ${POPUP_FONT}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    c2d.lineWidth = 5;
    c2d.lineJoin = 'round';
    for (const p of popups) {
      c2d.globalAlpha = Math.max(0, Math.min(1, p.ttl / POPUP_TTL));
      c2d.strokeStyle = 'rgba(0,0,0,0.55)';
      c2d.strokeText(p.text, p.x, p.y);
      c2d.fillStyle = p.color;
      c2d.fillText(p.text, p.x, p.y);
    }
    c2d.globalAlpha = 1;
  }

  /** Deterministic [0,1) hash for stable foliage jitter. Does not consume the
   *  gameplay rng, so spawn determinism is untouched. */
  function frand(n: number): number {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function spawnParticles(x: number, y: number, color: string): void {
    if (reducedMotion) return;
    for (let i = 0; i < HIT_PARTICLES.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * HIT_PARTICLES.speed + 60;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        ttl: HIT_PARTICLES.ttl,
        color,
        size: Math.random() * 4 + 3,
      });
    }
  }

  // ---- loop ------------------------------------------------------------
  let rafHandle = 0;
  function frame(): void {
    if (disposed) return;
    const tMs = now();
    let dt = lastMs === null ? 0 : (tMs - lastMs) / 1000;
    lastMs = tMs;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (status === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP_S && steps < MAX_STEPS_PER_FRAME && status === 'playing') {
        advanceOneTick();
        acc -= STEP_S;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0; // drop backlog after a stall
    }
    renderStep(dt);
    render();
    rafHandle = raf(frame);
  }

  // ---- boot ------------------------------------------------------------
  showStart();
  renderHud();
  bridge.setSize(WORLD_WIDTH, WORLD_HEIGHT);
  rafHandle = raf(frame);

  // ---- HUD + helpers ---------------------------------------------------
  function renderHud(): void {
    const showCounters = pres.showScore;
    hud.goal.dataset['hidden'] = showCounters ? 'false' : 'true';
    hud.level.dataset['hidden'] = showCounters ? 'false' : 'true';
    hud.score.dataset['hidden'] = showCounters ? 'false' : 'true';
    if (showCounters) {
      const goalText = verifiedFired
        ? `${simState.goodHits}`
        : `${simState.goodHits} / ${DEFAULT_SIM_CONFIG.passHits}`;
      hud.goal.innerHTML = `<span class="label">${strings.t('headerGoal')}</span>${goalText}`;
      hud.level.innerHTML = `<span class="label">${strings.t('headerLevel')}</span>${simState.levelIndex + 1}`;
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${simState.score}`;
    }
    updateTime();
    hud.badge.dataset['hidden'] = verifiedFired ? 'false' : 'true';
    hud.badge.textContent = `✓ ${strings.t('verifiedBadge')}`;
  }
  function updateTime(): void {
    const secs = Math.max(0, Math.ceil(simState.timeLeft));
    hud.time.innerHTML = `<span class="label">${strings.t('headerTime')}</span>${secs}`;
    hud.time.dataset['low'] = secs <= 5 && status === 'playing' ? 'true' : 'false';
  }
  function el(tag: string, className: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  }
  function buildHud(): { root: HTMLElement; time: HTMLElement; goal: HTMLElement; level: HTMLElement; score: HTMLElement; badge: HTMLElement } {
    const rootEl = el('div', 'wm-hud');
    const left = el('span', 'wm-hud-left');
    const time = el('span', 'wm-hud-time');
    const goal = el('span', 'wm-hud-goal');
    const level = el('span', 'wm-hud-level');
    left.append(time, goal, level);
    const right = el('span', 'wm-hud-right');
    const score = el('span', 'wm-hud-score');
    const badge = el('span', 'wm-badge');
    badge.dataset['hidden'] = 'true';
    right.append(score, badge);
    rootEl.append(left, right);
    return { root: rootEl, time, goal, level, score, badge };
  }
  function buildSoundButton(): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'wm-sound';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(soundOn));
    btn.setAttribute('aria-label', strings.t('ariaSound'));
    btn.innerHTML = soundOn ? SOUND_ON : SOUND_OFF;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      soundOn = !soundOn;
      sfx.setEnabled(soundOn);
      if (soundOn) sfx.resume();
      btn.setAttribute('aria-checked', String(soundOn));
      btn.innerHTML = soundOn ? SOUND_ON : SOUND_OFF;
    });
    return btn;
  }
  function applySkin(node: HTMLElement, context2: GameContext | undefined): void {
    const skin = context2?.skin ?? null;
    if (!skin) return;
    for (const key of SKIN_COLOR_KEYS) {
      const value = skin[key];
      if (typeof value === 'string') {
        node.style.setProperty(`--wm-${key.replace(/_/g, '-')}`, value);
      }
    }
  }

  // ---- cleanup ---------------------------------------------------------
  return function cleanup(): void {
    disposed = true;
    caf(rafHandle);
    canvas.removeEventListener('pointerdown', onPointerDown);
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    sfx.dispose();
    root.remove();
  };
}
