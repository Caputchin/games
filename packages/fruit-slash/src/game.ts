// Orchestrates Fruit Slash LIVE play. The authoritative game logic is
// the headless reducer in sim/engine; this module is the live DRIVER + renderer
// around it: it builds the DOM shell, runs a FIXED-STEP loop that advances the
// reducer one logical tick at a time, records the pointer input as the opaque
// trace, and renders the reducer's view projection. Because the live driver and
// the server replay run the SAME reducer over the SAME recorded ticks, the live
// score equals the replayed verdict by construction.
//
// What lives HERE (render-only, never in the verdict): the canvas + DOM chrome,
// the blade trail, the slice splatter particles, target spin animation, audio,
// and accessibility announcements. These may use real time / Math.random freely
// — they never touch the sim. What crosses to the server is only the recorded
// pointer trace; the seed comes from `ctx.seed`.

import type { Bridge, GameContext, Seed } from '@caputchin/game-sdk';
import { encodeTrace, type TickInput } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
import { DEFAULT_SIM_CONFIG } from './sim/config.js';
import { WORLD_WIDTH, WORLD_HEIGHT, TARGET_RADIUS, STEP_S } from './sim/constants.js';
import { GOOD, type Fx, type SimAction, type SimState, type SimView } from './sim/types.js';
import { buildStrings } from './strings.js';
import { resolveFruitSlashConfig } from './config.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import type { Vec } from './sim/geometry.js';
import { resolvePalette, type Palette } from './palette.js';
import { loadArt, type TargetArt } from './art.js';
import { renderStartScreen, renderGameOverScreen } from './screens.js';
import { STYLES } from './styles.js';
import { createSfx } from './audio.js';

const SKIN_COLOR_KEYS: readonly string[] = [
  'bg', 'fg', 'button_bg', 'button_text', 'button_hover', 'focus_ring',
];

// Speaker glyphs for the mute toggle; `currentColor` so they inherit the skin.
const SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a4.5 4.5 0 0 1 0 7"/></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

// Render-only tuning (never affects the verdict).
const BLADE_TRAIL_S = 0.22;
const SPLATTER = { count: 10, ttl: 0.45, speed: 280 } as const;
// Real-time clamp + catch-up bound: after a tab stall we cap one frame's real
// delta and the logical ticks it spends, so the game pauses through the stall
// rather than fast-forwarding. The recorded trace only ever holds the ticks that
// actually ran, so replay reproduces them either way.
const MAX_FRAME_DT = 0.1;
const MAX_STEPS_PER_FRAME = 10;

type Status = 'waiting' | 'playing' | 'over';

interface TrailPoint extends Vec {
  age: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  color: string;
  size: number;
}

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
  /** Injectable for tests; default to the view's rAF/caf/clock. */
  raf?: (cb: (ts: number) => void) => number;
  caf?: (handle: number) => void;
  now?: () => number;
}

/** Build a throwaway seed for a no-verify mount (no server seed issued). The
 *  replay never runs without a session, so any seed gives play variety; this is
 *  DRIVER-side (not the sim), so Math.random is fine here. */
function randomSeed(): Seed {
  const u = (): number => Math.floor(Math.random() * 0x100000000) >>> 0;
  return [u(), u(), u(), u()];
}

export function runFruitSlash(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);
  const now = opts.now ?? (() => (view.performance?.now ? view.performance.now() : Date.now()));

  const strings = buildStrings(ctx?.locale);
  // Presentation config (sound + HUD toggles + display thresholds). The SIM runs
  // under DEFAULT_SIM_CONFIG so live == replay; these displayed values mirror it.
  const pres = resolveFruitSlashConfig(ctx);
  const palette: Palette = resolvePalette(ctx?.skin ?? null);
  const reducedMotion = prefersReducedMotion(view);
  const sfx = createSfx(view, pres.sound);
  let soundOn = pres.sound;
  // Per-round seed: server-issued (replayable) or a driver-side random for the
  // no-verify mount. Reused across retries within this mount.
  const seed: Seed = ctx?.seed ?? randomSeed();

  if (!doc.getElementById('fs-styles')) {
    const style = doc.createElement('style');
    style.id = 'fs-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }

  // ---- DOM shell -------------------------------------------------------
  const root = el('div', 'fs-root');
  root.setAttribute('lang', strings.lang);
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', strings.t('ariaGame'));
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  root.dataset['theme'] = ctx?.skin?._theme === 'dark' ? 'dark' : 'light';
  applySkin(root, ctx);

  const stage = el('div', 'fs-stage');
  const canvas = doc.createElement('canvas');
  canvas.className = 'fs-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', strings.t('ariaGame'));

  const hud = buildHud();
  const overlay = el('div', 'fs-overlay-host');
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

  // Optional host-supplied art (data-URI/URL); shapes draw until it resolves.
  let art: TargetArt = { good: null, hazard: null };
  void loadArt(doc, ctx?.skin ?? null).then((a) => {
    if (!disposed) art = a;
  });

  // ---- driver state ----------------------------------------------------
  let status: Status = 'waiting';
  let state: SimState = engine.init({ seed, config: DEFAULT_SIM_CONFIG });
  let recorded: TickInput<SimAction>[] = [];
  let logicalTick = 0;
  let acc = 0;
  let lastMs: number | null = null;
  let renderClock = 0; // monotonic real-time seconds, drives spin + fades
  // Pointer actions queued since the last logical tick (real-time arrival order).
  let inputQueue: SimAction[] = [];
  let isDown = false;

  let verifiedFired = false;
  let verifiedScore = 0;
  let particles: Particle[] = [];
  let trail: TrailPoint[] = [];
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
    // The logical world is FIXED (sim-authoritative); letterbox it into the
    // canvas. A non-matching container aspect leaves bands, never reshapes the
    // world — the server has no container, so the world cannot depend on it.
    scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
    offX = (canvas.width - WORLD_WIDTH * scale) / 2;
    offY = (canvas.height - WORLD_HEIGHT * scale) / 2;
    const h = rect.height;
    root.dataset['size'] = h >= 420 ? 'lg' : h >= 150 ? 'md' : 'xs';
  }
  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => {
      if (!disposed) recomputeSize();
    });
    resizeObserver.observe(stage);
  }
  recomputeSize();

  /** Map a pointer event to LOGICAL WORLD coordinates (inverse of the render
   *  transform). Recorded coords are world-space, so replay matches. */
  function toWorld(e: { clientX: number; clientY: number }): Vec {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    const deviceX = (e.clientX - rect.left) * sx;
    const deviceY = (e.clientY - rect.top) * sy;
    return { x: (deviceX - offX) / scale, y: (deviceY - offY) / scale };
  }

  // ---- input (queue actions; the fixed-step loop applies + records them) --
  function onPointerDown(e: PointerEvent): void {
    if (status !== 'playing') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    isDown = true;
    const p = toWorld(e);
    inputQueue.push({ k: 0, x: p.x, y: p.y });
    trail = [{ ...p, age: 0 }];
  }
  function onPointerMove(e: PointerEvent): void {
    if (!isDown || status !== 'playing') return;
    // Recover dropped samples on a fast flick so both the slice and the blade
    // track the real path.
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [e];
    for (const ev of samples) {
      const p = toWorld(ev);
      inputQueue.push({ k: 1, x: p.x, y: p.y });
      trail.push({ ...p, age: 0 });
      if (trail.length > 24) trail.shift();
    }
  }
  function onPointerUp(e?: PointerEvent): void {
    if (e) { try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ } }
    if (!isDown) return;
    isDown = false;
    if (status === 'playing') inputQueue.push({ k: 2 });
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    status = 'waiting';
    overlay.replaceChildren(renderStartScreen(doc, strings, start));
    focusOverlayButton();
  }
  function start(): void {
    overlay.replaceChildren();
    state = engine.init({ seed, config: DEFAULT_SIM_CONFIG });
    recorded = [];
    logicalTick = 0;
    acc = 0;
    lastMs = null;
    inputQueue = [];
    isDown = false;
    verifiedFired = false;
    verifiedScore = 0;
    particles = [];
    trail = [];
    status = 'playing';
    renderHud();
    announcer.say(strings.t('announceStart'));
    sfx.resume(); // unlock audio on this user gesture (the Start click)
    canvas.focus();
  }
  function onVerified(): void {
    if (verifiedFired) return;
    verifiedFired = true;
    verifiedScore = state.sliced;
    // Captcha satisfied: hand the widget the trace SO FAR. The server replays it
    // to the pass threshold and returns the authoritative verdict. The round
    // keeps running so the player can raise their score.
    bridge.pass({ trace: encodeTrace(recorded) });
    sfx.verify();
    announcer.say(strings.t('announceWin', { score: state.sliced }));
    renderHud();
  }
  function onGameOver(): void {
    status = 'over';
    // If the player beat their verified score after passing, resubmit the longer
    // trace so the server's replayed score reflects the full round (the widget
    // keeps the best). A never-verified loss submits nothing — local retry only.
    if (verifiedFired && state.sliced > verifiedScore) {
      bridge.pass({ trace: encodeTrace(recorded) });
    }
    announcer.say(strings.t('announceGameOver', { score: state.sliced }));
    overlay.replaceChildren(
      renderGameOverScreen(doc, strings, { won: verifiedFired, score: state.sliced, onRetry: start }),
    );
    focusOverlayButton();
  }
  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- fixed-step driver ----------------------------------------------
  /** Advance the reducer exactly one logical tick: clear last tick's render
   *  cues, apply + record the queued input, tick the sim, then react to the new
   *  state (fx, HUD, pass / game-over). */
  function advanceOneTick(): void {
    state.fx = [];
    const acts = inputQueue;
    inputQueue = [];
    for (const a of acts) {
      state = engine.step(state, a);
      recorded.push({ tick: logicalTick, action: a });
    }
    state = engine.tick(state);
    logicalTick++;
    consumeFx(state.fx);
    renderHud();
    if (state.verified && !verifiedFired) onVerified();
    if (engine.isOver(state)) onGameOver();
  }

  /** Turn this tick's render cues into splatter + sfx + announcements. */
  function consumeFx(fx: readonly Fx[]): void {
    let sliced = false;
    let missed = false;
    for (const f of fx) {
      if (f.kind === 'slice') {
        sliced = true;
        sfx.slice();
        spawnSplatter(f.x, f.y, palette.good[f.hue] ?? palette.good[0]);
      } else if (f.kind === 'bomb') {
        sfx.bomb();
        spawnSplatter(f.x, f.y, palette.hazard);
      } else {
        missed = true;
        sfx.life();
      }
    }
    if (sliced) announcer.say(strings.t('announceSlice', { score: state.sliced }));
    if (missed && status === 'playing') announcer.say(strings.t('announceLife', { lives: state.lives }));
  }

  /** Age the render-only particles + blade trail by real `dt` (cosmetic). */
  function renderStep(dt: number): void {
    for (const p of particles) {
      p.vy += DEFAULT_SIM_CONFIG.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
    }
    particles = particles.filter((p) => p.ttl > 0);
    for (const tp of trail) tp.age += dt;
    trail = trail.filter((tp) => tp.age < BLADE_TRAIL_S);
  }

  // ---- rendering -------------------------------------------------------
  function render(): void {
    const v: SimView = engine.view ? engine.view(state) : (state as unknown as SimView);
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.setTransform(scale, 0, 0, scale, offX, offY);
    for (const t of v.targets) drawTarget(t);
    drawParticles();
    drawTrail();
  }

  function drawTarget(t: SimView['targets'][number]): void {
    const { x, y } = t;
    const r = TARGET_RADIUS;
    // Spin animates from a render-side clock (cosmetic, never in the verdict).
    const spin = t.spin + t.spinRate * renderClock;
    c2d.save();
    c2d.translate(x, y);
    c2d.rotate(spin);
    if (t.kind !== GOOD) {
      if (art.hazard) {
        c2d.drawImage(art.hazard, -r, -r, r * 2, r * 2);
      } else {
        c2d.fillStyle = palette.hazard;
        c2d.strokeStyle = palette.hazardStroke;
        c2d.lineWidth = 3;
        circle(0, 0, r);
        c2d.fill();
        c2d.stroke();
        c2d.globalAlpha = 0.22;
        c2d.fillStyle = '#ffffff';
        circle(-r * 0.34, -r * 0.36, r * 0.26);
        c2d.fill();
        c2d.globalAlpha = 1;
        c2d.fillStyle = palette.hazardStroke;
        c2d.fillRect(-r * 0.18, -r * 1.08, r * 0.36, r * 0.3);
        c2d.strokeStyle = '#9A7B3A';
        c2d.lineWidth = Math.max(3, r * 0.12);
        c2d.lineCap = 'round';
        c2d.beginPath();
        c2d.moveTo(0, -r * 1.08);
        c2d.quadraticCurveTo(r * 0.55, -r * 1.45, r * 0.45, -r * 1.75);
        c2d.stroke();
        c2d.fillStyle = '#FFD23F';
        circle(r * 0.45, -r * 1.75, r * 0.17);
        c2d.fill();
        c2d.fillStyle = '#FF7A1A';
        circle(r * 0.45, -r * 1.75, r * 0.09);
        c2d.fill();
      }
    } else {
      const fill = palette.good[t.hue] ?? palette.good[0];
      if (art.good) {
        c2d.drawImage(art.good, -r, -r, r * 2, r * 2);
      } else {
        c2d.fillStyle = fill;
        c2d.strokeStyle = palette.goodStroke;
        c2d.lineWidth = 3;
        circle(0, 0, r);
        c2d.fill();
        c2d.stroke();
        c2d.globalAlpha = 0.3;
        c2d.fillStyle = '#ffffff';
        circle(-r * 0.32, -r * 0.34, r * 0.32);
        c2d.fill();
        c2d.globalAlpha = 1;
        c2d.fillStyle = palette.good[2];
        c2d.beginPath();
        c2d.ellipse(0, -r, r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
        c2d.fill();
      }
    }
    c2d.restore();
  }

  function drawParticles(): void {
    for (const p of particles) {
      c2d.globalAlpha = Math.max(0, Math.min(1, p.ttl / SPLATTER.ttl));
      c2d.fillStyle = p.color;
      circle(p.x, p.y, p.size);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
  }

  function drawTrail(): void {
    if (trail.length < 2) return;
    c2d.save();
    c2d.strokeStyle = palette.blade;
    c2d.lineCap = 'round';
    c2d.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const prev = trail[i - 1]!;
      const cur = trail[i]!;
      const k = i / trail.length;
      c2d.globalAlpha = k * 0.85;
      c2d.lineWidth = 2 + k * 10;
      c2d.beginPath();
      c2d.moveTo(prev.x, prev.y);
      c2d.lineTo(cur.x, cur.y);
      c2d.stroke();
    }
    c2d.restore();
    c2d.globalAlpha = 1;
  }

  function circle(x: number, y: number, r: number): void {
    c2d.beginPath();
    c2d.arc(x, y, r, 0, Math.PI * 2);
  }

  function spawnSplatter(x: number, y: number, color: string): void {
    if (reducedMotion) return;
    for (let i = 0; i < SPLATTER.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * SPLATTER.speed + 60;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        ttl: SPLATTER.ttl,
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
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // clamp after a stall
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
    renderClock += dt;
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
    hud.score.dataset['hidden'] = pres.showScore ? 'false' : 'true';
    hud.livesWrap.dataset['hidden'] = pres.showLives ? 'false' : 'true';
    hud.badge.dataset['hidden'] = verifiedFired ? 'false' : 'true';
    hud.badge.textContent = `✓ ${strings.t('verifiedBadge')}`;
    if (pres.showScore) {
      const tally = verifiedFired ? `${state.sliced}` : `${state.sliced} / ${pres.passScore}`;
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${tally}`;
    }
    if (pres.showLives) {
      hud.lives.replaceChildren();
      for (let i = 0; i < pres.lives; i++) {
        const pip = el('span', 'fs-pip');
        pip.dataset['spent'] = i >= state.lives ? 'true' : 'false';
        hud.lives.appendChild(pip);
      }
    }
  }
  function el(tag: string, className: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  }
  function buildHud(): { root: HTMLElement; score: HTMLElement; badge: HTMLElement; lives: HTMLElement; livesWrap: HTMLElement } {
    const rootEl = el('div', 'fs-hud');
    const score = el('span', 'fs-hud-score');
    const badge = el('span', 'fs-badge');
    badge.dataset['hidden'] = 'true';
    const livesWrap = el('span', 'fs-hud-lives-wrap');
    const livesLabel = el('span', 'label');
    livesLabel.textContent = strings.t('headerLives');
    const lives = el('span', 'fs-hud-lives');
    livesWrap.append(livesLabel, lives);
    rootEl.append(score, badge, livesWrap);
    return { root: rootEl, score, badge, lives, livesWrap };
  }
  function buildSoundButton(): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'fs-sound';
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
        node.style.setProperty(`--fs-${key.replace(/_/g, '-')}`, value);
      }
    }
  }

  // ---- cleanup ---------------------------------------------------------
  return function cleanup(): void {
    disposed = true;
    caf(rafHandle);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    sfx.dispose();
    root.remove();
  };
}
