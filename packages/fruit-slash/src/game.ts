// Orchestrates Fruit Slash: builds the DOM shell + canvas, runs an OWN
// requestAnimationFrame loop driven by real elapsed time, captures the pointer
// slice, and drives the state machine (waiting -> playing -> won | over ->
// playing). Pure physics live in launch.ts, slice math in geometry.ts,
// pass/lives in scoring.ts, spawn lifecycle in spawner.ts; this module is the
// glue + the pass gate.
//
// Frame-rate independence is the core requirement: every simulation step is
// scaled by real `dt` seconds (clamped to MAX_DT), and update + render run
// every frame at the native refresh. There is no fixed-60 stepping and no
// per-frame constant — the same arc plays at the same speed on 60Hz or 240Hz
// (locked by tests/frame-rate.test.ts).
//
// Nothing about the next fruit is written to the DOM or the accessibility
// tree, so a scraper that reads the page learns nothing about the solution.

import type { Bridge, GameContext } from '@caputchin/game-sdk';
import { buildStrings } from './strings.js';
import { resolveFruitSlashConfig } from './config.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { swipeHitsCircle, type Vec } from './geometry.js';
import { onGoodSlice, onLifeLost, type RoundState } from './scoring.js';
import { Spawner, type Target } from './spawner.js';
import { resolvePalette, type Palette } from './palette.js';
import { loadArt, type TargetArt } from './art.js';
import { renderStartScreen, renderGameOverScreen } from './screens.js';
import { STYLES } from './styles.js';
import { difficultyAt } from './progression.js';
import { createSfx } from './audio.js';
import { launchBounds, WORLD_WIDTH, WORLD_HEIGHT, MAX_DT, TARGET_RADIUS, HIT_PAD, BLADE_TRAIL_S, SPLATTER, MAX_CONCURRENT } from './constants.js';

const SKIN_COLOR_KEYS: readonly string[] = [
  'bg', 'fg', 'button_bg', 'button_text', 'button_hover', 'focus_ring',
];

// Speaker glyphs for the mute toggle; `currentColor` so they inherit the skin.
const SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a4.5 4.5 0 0 1 0 7"/></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

// The captcha is satisfied at the pass threshold (bridge.pass fires once) but
// the round keeps running so the player can raise their score; it ends only on
// lives-out. So there is no separate "won" status — just a `verified` flag.
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

export function runFruitSlash(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const raf = opts.raf ?? view.requestAnimationFrame.bind(view);
  const caf = opts.caf ?? view.cancelAnimationFrame.bind(view);
  const now = opts.now ?? (() => (view.performance?.now ? view.performance.now() : Date.now()));

  const strings = buildStrings(ctx?.locale);
  const cfg = resolveFruitSlashConfig(ctx);
  const palette: Palette = resolvePalette(ctx?.skin ?? null);
  const reducedMotion = prefersReducedMotion(view);
  const bounds = launchBounds(cfg.gravity);
  const sfx = createSfx(view, cfg.sound);
  let soundOn = cfg.sound; // live mute state; the in-game toggle flips it
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  let rngState = seed;
  const rng = (): number => {
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

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

  // ---- state -----------------------------------------------------------
  let status: Status = 'waiting';
  let spawner = new Spawner(rng, bounds, { spawnRate: cfg.spawnRate, hazardChance: cfg.hazardChance, maxConcurrent: MAX_CONCURRENT });
  let round: RoundState = { sliced: 0, lives: cfg.lives, passScore: cfg.passScore };
  let particles: Particle[] = [];
  let trail: TrailPoint[] = [];
  let pointerDown = false;
  let lastPoint: Vec | null = null;
  let verified = false; // pass threshold reached; bridge.pass fired once
  let verifiedScore = 0; // score reported at verification; resend if beaten
  let elapsed = 0; // seconds of play this round, drives the difficulty ramp
  let roundStartMs = 0;
  let disposed = false;

  // ---- view transform (world -> device px) -----------------------------
  let scale = 1;
  let offX = 0;
  let offY = 0;
  function recomputeSize(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(view.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
    offX = (canvas.width - WORLD_WIDTH * scale) / 2;
    offY = (canvas.height - WORLD_HEIGHT * scale) / 2;
  }
  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => {
      if (!disposed) recomputeSize();
    });
    resizeObserver.observe(stage);
  }
  recomputeSize();

  /** Map a pointer event to world coordinates (inverse of the render transform). */
  function toWorld(e: PointerEvent): Vec {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? canvas.width / rect.width : 1;
    const sy = rect.height > 0 ? canvas.height / rect.height : 1;
    const deviceX = (e.clientX - rect.left) * sx;
    const deviceY = (e.clientY - rect.top) * sy;
    return { x: (deviceX - offX) / scale, y: (deviceY - offY) / scale };
  }

  // ---- input -----------------------------------------------------------
  function onPointerDown(e: PointerEvent): void {
    if (status !== 'playing') return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    pointerDown = true;
    lastPoint = toWorld(e);
    trail = [{ ...lastPoint, age: 0 }];
  }
  function onPointerMove(e: PointerEvent): void {
    if (!pointerDown || status !== 'playing') return;
    // Recover dropped samples on a fast flick so the blade tracks the real path.
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const samples = coalesced.length ? coalesced : [e];
    for (const ev of samples) {
      const p = toWorld(ev);
      if (lastPoint) sliceSegment(lastPoint, p);
      trail.push({ ...p, age: 0 });
      if (trail.length > 24) trail.shift();
      lastPoint = p;
    }
  }
  function onPointerUp(e?: PointerEvent): void {
    if (e) { try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ } }
    pointerDown = false;
    lastPoint = null;
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // ---- slicing ---------------------------------------------------------
  function sliceSegment(a: Vec, b: Vec): void {
    const path = [a, b];
    for (const t of spawner.live) {
      if (t.sliced) continue;
      if (swipeHitsCircle(path, { x: t.state.x, y: t.state.y, r: TARGET_RADIUS + HIT_PAD })) {
        sliceTarget(t);
      }
    }
  }
  function sliceTarget(t: Target): void {
    t.sliced = true;
    const color = t.kind === 'hazard' ? palette.hazard : palette.good[t.hue] ?? palette.good[0];
    spawnSplatter(t.state.x, t.state.y, color);
    if (t.kind === 'hazard') {
      sfx.bomb();
      loseLife();
    } else {
      sfx.slice();
      const r = onGoodSlice(round);
      round = r.state;
      renderHud();
      announcer.say(strings.t('announceSlice', { score: round.sliced }));
      if (r.event === 'pass') markVerified();
    }
  }
  function loseLife(): void {
    const r = onLifeLost(round);
    round = r.state;
    renderHud();
    if (r.event === 'gameover') {
      over();
    } else {
      announcer.say(strings.t('announceLife', { lives: round.lives }));
    }
  }

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    status = 'waiting';
    overlay.replaceChildren(renderStartScreen(doc, strings, start));
    focusOverlayButton();
  }
  function start(): void {
    overlay.replaceChildren();
    spawner = new Spawner(rng, bounds, { spawnRate: cfg.spawnRate, hazardChance: cfg.hazardChance, maxConcurrent: MAX_CONCURRENT });
    round = { sliced: 0, lives: cfg.lives, passScore: cfg.passScore };
    particles = [];
    trail = [];
    verified = false;
    verifiedScore = 0;
    elapsed = 0;
    roundStartMs = now();
    status = 'playing';
    renderHud();
    announcer.say(strings.t('announceStart'));
    sfx.resume(); // unlock audio on this user gesture (the Start click)
    canvas.focus();
  }
  function markVerified(): void {
    if (verified) return;
    verified = true;
    verifiedScore = round.sliced;
    // Captcha satisfied: report success once. The round keeps running so the
    // player can raise their score; a Verified badge shows in the HUD.
    bridge.pass({ score: round.sliced, durationMs: Math.round(now() - roundStartMs) });
    sfx.verify();
    announcer.say(strings.t('announceWin', { score: round.sliced }));
    renderHud();
  }
  function over(): void {
    status = 'over';
    // Once the round is completely done, resend the final score if the player
    // beat the score reported at verification. Score is the slice count, which
    // only increases, so the final tally is the highest. Mirrors dino's
    // new-best resend; the widget keeps the best score the visitor reached.
    if (verified && round.sliced > verifiedScore) {
      bridge.pass({ score: round.sliced, durationMs: Math.round(now() - roundStartMs) });
    }
    announcer.say(strings.t('announceGameOver', { score: round.sliced }));
    // Verified players see a success-framed end screen; the rest see game over.
    overlay.replaceChildren(renderGameOverScreen(doc, strings, { won: verified, score: round.sliced, onRetry: start }));
    focusOverlayButton();
  }
  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- simulation ------------------------------------------------------
  function update(dt: number): void {
    // Ramp difficulty with elapsed play time (faster spawns, more bombs).
    elapsed += dt;
    spawner.setDifficulty(difficultyAt(elapsed, { spawnRate: cfg.spawnRate, hazardChance: cfg.hazardChance }));
    const { escaped } = spawner.update(dt);
    for (const t of escaped) {
      if (t.kind !== 'hazard') {
        sfx.life();
        loseLife();
        if (status !== 'playing') break; // game over mid-batch
      }
    }
    // Particles: same gravity, fade by ttl.
    for (const p of particles) {
      p.vy += cfg.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
    }
    particles = particles.filter((p) => p.ttl > 0);
    // Blade trail fade.
    for (const tp of trail) tp.age += dt;
    trail = trail.filter((tp) => tp.age < BLADE_TRAIL_S);
  }

  // ---- rendering -------------------------------------------------------
  function render(): void {
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.setTransform(scale, 0, 0, scale, offX, offY);
    for (const t of spawner.live) drawTarget(t);
    drawParticles();
    drawTrail();
  }

  function drawTarget(t: Target): void {
    const { x, y } = t.state;
    const r = TARGET_RADIUS;
    c2d.save();
    c2d.translate(x, y);
    c2d.rotate(t.spin);
    if (t.kind === 'hazard') {
      if (art.hazard) {
        c2d.drawImage(art.hazard, -r, -r, r * 2, r * 2);
      } else {
        // Round bomb body.
        c2d.fillStyle = palette.hazard;
        c2d.strokeStyle = palette.hazardStroke;
        c2d.lineWidth = 3;
        circle(0, 0, r);
        c2d.fill();
        c2d.stroke();
        // Metallic highlight so it reads as a sphere, not a dark fruit.
        c2d.globalAlpha = 0.22;
        c2d.fillStyle = '#ffffff';
        circle(-r * 0.34, -r * 0.36, r * 0.26);
        c2d.fill();
        c2d.globalAlpha = 1;
        // Fuse cap on top.
        c2d.fillStyle = palette.hazardStroke;
        c2d.fillRect(-r * 0.18, -r * 1.08, r * 0.36, r * 0.3);
        // Curved fuse.
        c2d.strokeStyle = '#9A7B3A';
        c2d.lineWidth = Math.max(3, r * 0.12);
        c2d.lineCap = 'round';
        c2d.beginPath();
        c2d.moveTo(0, -r * 1.08);
        c2d.quadraticCurveTo(r * 0.55, -r * 1.45, r * 0.45, -r * 1.75);
        c2d.stroke();
        // Lit spark at the fuse tip (the unmistakable "bomb" cue).
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
        // highlight
        c2d.globalAlpha = 0.3;
        c2d.fillStyle = '#ffffff';
        circle(-r * 0.32, -r * 0.34, r * 0.32);
        c2d.fill();
        c2d.globalAlpha = 1;
        // leaf
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
      const angle = rng() * Math.PI * 2;
      const speed = rng() * SPLATTER.speed + 60;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        ttl: SPLATTER.ttl,
        color,
        size: rng() * 4 + 3,
      });
    }
  }

  // ---- loop ------------------------------------------------------------
  let rafHandle = 0;
  let lastMs: number | null = null;
  function frame(): void {
    if (disposed) return;
    const tMs = now();
    let dt = lastMs === null ? 0 : (tMs - lastMs) / 1000;
    lastMs = tMs;
    if (dt > MAX_DT) dt = MAX_DT; // clamp after a stall so nothing teleports
    if (status === 'playing' && dt > 0) update(dt);
    render();
    rafHandle = raf(frame);
  }

  // ---- boot ------------------------------------------------------------
  showStart();
  renderHud();
  // Tell the widget our intrinsic footprint once (explicit escape hatch).
  bridge.setSize(WORLD_WIDTH, WORLD_HEIGHT);
  rafHandle = raf(frame);

  // ---- HUD + helpers ---------------------------------------------------
  function renderHud(): void {
    hud.score.dataset['hidden'] = cfg.showScore ? 'false' : 'true';
    hud.livesWrap.dataset['hidden'] = cfg.showLives ? 'false' : 'true';
    hud.badge.dataset['hidden'] = verified ? 'false' : 'true';
    hud.badge.textContent = `✓ ${strings.t('verifiedBadge')}`;
    if (cfg.showScore) {
      // Before verifying, show progress toward the goal; after, just the tally
      // (the round is now open-ended for score).
      const tally = verified ? `${round.sliced}` : `${round.sliced} / ${cfg.passScore}`;
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${tally}`;
    }
    if (cfg.showLives) {
      hud.lives.replaceChildren();
      for (let i = 0; i < cfg.lives; i++) {
        const pip = el('span', 'fs-pip');
        pip.dataset['spent'] = i >= round.lives ? 'true' : 'false';
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
  // In-game mute toggle: an accessible switch (aria-checked = sound ON) that
  // enables/disables the sfx at runtime. Shown always so the player can turn
  // sound on even when the host's config defaults it off.
  function buildSoundButton(): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'fs-sound';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(soundOn));
    btn.setAttribute('aria-label', strings.t('ariaSound'));
    btn.innerHTML = soundOn ? SOUND_ON : SOUND_OFF;
    // Keep a tap on the toggle from reaching the canvas slice handler.
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
