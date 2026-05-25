// Orchestrates Whack-a-Monkey: builds the DOM shell + canvas, runs an OWN
// requestAnimationFrame loop driven by real elapsed time, maps a tap to the
// monkey at the tapped spawn point, and drives the state machine
// (waiting -> playing -> over -> playing). Pure spring lifecycle lives in
// mole.ts, grid spawn in spawner.ts, tap geometry in geometry.ts, the ladder in
// levels.ts, the pass gate + scoring in scoring.ts; this module is the glue +
// the jungle scene render.
//
// Frame-rate independence is the core requirement: every step is scaled by real
// `dt` seconds (clamped to MAX_DT), and update + render run every frame at the
// native refresh. No fixed-60 stepping, no per-frame constant (locked by
// tests/frame-rate.test.ts).
//
// Anti-scrape: holes/moles are all drawn on the canvas, never in the DOM or the
// a11y tree, and the spawn cells are HIDDEN behind a continuous foliage hedge,
// so neither a scraper nor a player can tell where a monkey will pop until it
// peeks out.

import type { Bridge, GameContext } from '@caputchin/game-sdk';
import { buildStrings } from './strings.js';
import { resolveWhackConfig } from './config.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { computeHoleCenters, pointInCircle, type Vec } from './geometry.js';
import { initRound, onGoodHit, onDecoyHit, isPass, type RoundState } from './scoring.js';
import { Spawner } from './spawner.js';
import { isTappable, timingFraction, hitScale, type Mole } from './mole.js';
import { buildLadder, type LevelParams } from './levels.js';
import { resolvePalette, type Palette } from './palette.js';
import { loadSprites, loadScenery, type SpriteMap, type SpriteKey, type SceneryArt } from './art.js';
import { renderStartScreen, renderEndScreen } from './screens.js';
import { STYLES } from './styles.js';
import { createSfx } from './audio.js';
import { makeRng } from './rng.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_HEIGHT_MIN,
  WORLD_HEIGHT_MAX,
  MAX_DT,
  MOLE_RADIUS,
  MOLE_HIT_PAD,
  HOLE_COUNT,
  GRID_COLS,
  GRID_ROWS,
  HIT_PARTICLES,
  PARTICLE_GRAVITY,
  DECOY_FLASH_S,
  DECOY_TIME_PENALTY_S,
  POPUP_TTL,
  POPUP_RISE,
  POPUP_FONT,
  LEVEL_COUNT,
} from './constants.js';

const SKIN_COLOR_KEYS: readonly string[] = [
  'bg', 'fg', 'button_bg', 'button_text', 'button_hover', 'focus_ring',
];

const SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a4.5 4.5 0 0 1 0 7"/></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

type Status = 'waiting' | 'playing' | 'over';

interface Particle {
  x: number; y: number; vx: number; vy: number; ttl: number; color: string; size: number;
}
interface ScorePopup {
  x: number; y: number; vy: number; text: string; color: string; ttl: number;
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
  const cfg = resolveWhackConfig(ctx);
  const palette: Palette = resolvePalette(ctx?.skin ?? null);
  const reducedMotion = prefersReducedMotion(view);
  const ladder: LevelParams[] = buildLadder({
    baseUptimeMs: cfg.baseUptimeMs,
    baseDecoyChance: cfg.baseDecoyChance,
    passHits: cfg.passHits,
  });
  const sfx = createSfx(view, cfg.sound);
  let soundOn = cfg.sound;
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rng = makeRng(seed);

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

  // Animal sprites (bundled defaults + optional skin overrides) and the jungle
  // foliage (bundled white masks, tinted at draw time). Discs draw until they
  // resolve; a broken image stays null and the disc remains.
  let sprites: SpriteMap | null = null;
  let scenery: SceneryArt | null = null;
  void loadSprites(doc, ctx?.skin ?? null).then((s) => { if (!disposed) sprites = s; });
  void loadScenery(doc).then((s) => { if (!disposed) scenery = s; });

  // Tinted-foliage cache: white mask + color -> tinted offscreen canvas, built
  // once per (sprite,color) pair.
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

  // ---- state -----------------------------------------------------------
  let status: Status = 'waiting';
  let spawner = newSpawner(0);
  let round: RoundState = initRound(cfg.passHits);
  let levelIndex = 0;
  let hitsInLevel = 0;
  let particles: Particle[] = [];
  let popups: ScorePopup[] = [];
  let decoyFlash = 0;
  let verified = false;
  let verifiedScore = 0; // score when the pass latched; final score is resent if it climbs
  let elapsed = 0;
  let timeLeft = cfg.seconds; // seconds on the clock; the round is lost at 0
  let roundStartMs = 0;
  let disposed = false;

  // ---- view transform (world -> device px) -----------------------------
  let worldHeight = WORLD_HEIGHT;
  let holes: Vec[] = computeHoleCenters(worldHeight);
  let scale = 1;
  let offX = 0;
  let offY = 0;
  function recomputeSize(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(view.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    worldHeight = Math.max(WORLD_HEIGHT_MIN, Math.min(WORLD_HEIGHT_MAX, (WORLD_WIDTH * rect.height) / rect.width));
    holes = computeHoleCenters(worldHeight);
    scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / worldHeight);
    offX = (canvas.width - WORLD_WIDTH * scale) / 2;
    offY = (canvas.height - worldHeight * scale) / 2;
    const h = rect.height;
    root.dataset['size'] = h >= 380 ? 'lg' : h >= 180 ? 'md' : 'xs';
  }
  let resizeObserver: ResizeObserver | null = null;
  if (typeof view.ResizeObserver === 'function') {
    resizeObserver = new view.ResizeObserver(() => { if (!disposed) recomputeSize(); });
    resizeObserver.observe(stage);
  }
  recomputeSize();

  function newSpawner(level: number): Spawner {
    const p = ladder[level]!;
    return new Spawner(rng, HOLE_COUNT, { spawnRate: p.spawnRate, decoyChance: p.decoyChance, uptimeMs: p.uptimeMs });
  }

  // Hedge baseline for a row: a little below the row's hole center. The monkey's
  // bottom anchors here and the foliage hedge is drawn over it so the base is
  // hidden and only the head/torso peeks out.
  function rowOf(holeIndex: number): number { return Math.floor(holeIndex / GRID_COLS); }
  function hedgeBaselineY(rowCenterY: number): number { return rowCenterY + MOLE_RADIUS * 0.55; }

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
    const p = toWorld(e);
    for (const m of spawner.moles) {
      if (!isTappable(m)) continue;
      const center = holes[m.holeIndex]!;
      const r = MOLE_RADIUS * hitScale(m) + MOLE_HIT_PAD;
      if (pointInCircle(p.x, p.y, center.x, center.y, r)) {
        handleTap(m);
        return;
      }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);

  function handleTap(mole: Mole): void {
    const fresh = timingFraction(mole);
    const center = holes[mole.holeIndex]!;
    const kind = spawner.tap(mole.holeIndex);
    if (kind === null) return;
    if (kind === 'monkey') {
      sfx.whack();
      const before = round.score;
      round = onGoodHit(round, fresh);
      hitsInLevel += 1;
      spawnParticles(center.x, center.y, palette.goodTint);
      pushPopup(center.x, center.y, `+${round.score - before}`, palette.goodTint);
      announcer.say(strings.t('announceHit', { score: round.score }));
      advanceDifficulty();
      renderHud();
      if (!verified && isPass(round)) markVerified(); // pass, but keep playing for score
    } else {
      // Wrong tap: dock points AND burn seconds off the clock (the punishment +
      // the anti-spray lever). A missed monkey costs nothing but progress.
      sfx.decoy();
      const before = round.score;
      round = onDecoyHit(round);
      timeLeft = Math.max(0, timeLeft - DECOY_TIME_PENALTY_S);
      decoyFlash = DECOY_FLASH_S;
      pushPopup(center.x, center.y, `${round.score - before} · -${DECOY_TIME_PENALTY_S}s`, palette.decoyFlash);
      updateTime();
      renderHud();
      announcer.say(strings.t('announceDecoy'));
      if (timeLeft <= 0) endRound();
    }
  }

  function pushPopup(x: number, y: number, text: string, color: string): void {
    popups.push({ x, y: y - MOLE_RADIUS * 0.4, vy: reducedMotion ? 0 : -POPUP_RISE, text, color, ttl: POPUP_TTL });
  }

  // Levels only ramp difficulty now; they do not end the round. The round ends
  // on a win (goal reached before time) or a loss (the clock hits zero).
  function advanceDifficulty(): void {
    if (levelIndex >= LEVEL_COUNT - 1) return; // already at the hardest level
    if (hitsInLevel < ladder[levelIndex]!.goal) return;
    levelIndex += 1;
    hitsInLevel = 0;
    spawner.setDifficulty({
      spawnRate: ladder[levelIndex]!.spawnRate,
      decoyChance: ladder[levelIndex]!.decoyChance,
      uptimeMs: ladder[levelIndex]!.uptimeMs,
    });
    sfx.level();
    announcer.say(strings.t('announceLevel', { level: levelIndex + 1 }));
  }

  // ---- state transitions ----------------------------------------------
  function showStart(): void {
    status = 'waiting';
    overlay.replaceChildren(renderStartScreen(doc, strings, start));
    focusOverlayButton();
  }
  function start(): void {
    overlay.replaceChildren();
    levelIndex = 0;
    hitsInLevel = 0;
    spawner = newSpawner(0);
    round = initRound(cfg.passHits);
    particles = [];
    popups = [];
    decoyFlash = 0;
    verified = false;
    verifiedScore = 0;
    elapsed = 0;
    timeLeft = cfg.seconds;
    roundStartMs = now();
    status = 'playing';
    renderHud();
    announcer.say(strings.t('announceStart'));
    sfx.resume();
    canvas.focus();
  }
  // Reaching the goal latches the pass + shows the Verified badge, but the round
  // keeps running so the player can raise their score (like dino-runner /
  // fruit-slash). bridge.pass fires once here; endRound resends the final score
  // if it climbed.
  function markVerified(): void {
    if (verified) return;
    verified = true;
    verifiedScore = round.score;
    bridge.pass({ score: round.score, durationMs: Math.round(now() - roundStartMs) });
    sfx.verify();
    announcer.say(strings.t('announceWin', { score: round.score }));
    renderHud();
  }
  // The round ends only when the clock hits zero. Verified players see the
  // success screen (final score resent if it beat the pass-time score); everyone
  // else sees time's-up.
  function endRound(): void {
    if (status === 'over') return;
    status = 'over';
    const won = verified;
    if (won && round.score > verifiedScore) {
      bridge.pass({ score: round.score, durationMs: Math.round(now() - roundStartMs) });
    }
    announcer.say(strings.t(won ? 'announceWin' : 'announceOver', { score: round.score }));
    overlay.replaceChildren(renderEndScreen(doc, strings, { won, score: round.score, onRetry: start }));
    focusOverlayButton();
    renderHud();
  }
  function focusOverlayButton(): void {
    const btn = overlay.querySelector('button');
    if (btn instanceof HTMLButtonElement) btn.focus();
  }

  // ---- simulation ------------------------------------------------------
  function update(dt: number): void {
    elapsed += dt;
    timeLeft -= dt;
    updateTime();
    if (timeLeft <= 0) { timeLeft = 0; endRound(); return; }
    spawner.update(dt); // a monkey that ducks untapped costs nothing, just no progress
    for (const p of particles) {
      p.vy += PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
    }
    if (particles.length > 0) particles = particles.filter((p) => p.ttl > 0);
    for (const pop of popups) { pop.y += pop.vy * dt; pop.ttl -= dt; }
    if (popups.length > 0) popups = popups.filter((p) => p.ttl > 0);
    if (decoyFlash > 0) decoyFlash = Math.max(0, decoyFlash - dt);
  }

  // ---- rendering -------------------------------------------------------
  function render(): void {
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.setTransform(scale, 0, 0, scale, offX, offY);
    drawBackdrop();
    drawDistantFoliage();
    // Rows top to bottom (painter's order): a row's animals, then its hedge,
    // so the hedge masks that row's monkeys' bases and lower rows sit in front.
    for (let row = 0; row < GRID_ROWS; row++) {
      for (const m of spawner.moles) if (rowOf(m.holeIndex) === row) drawMole(m);
      drawHedge(row);
    }
    drawForegroundGrass();
    drawParticles();
    drawDecoyFlash();
    drawPopups();
  }

  function drawBackdrop(): void {
    const g = c2d.createLinearGradient(0, 0, 0, worldHeight);
    g.addColorStop(0, palette.canopyTop);
    g.addColorStop(1, palette.canopyBottom);
    c2d.fillStyle = g;
    c2d.fillRect(0, 0, WORLD_WIDTH, worldHeight);
  }

  // A soft, dark foliage band near the top for depth (does not hide spawns).
  function drawDistantFoliage(): void {
    if (!scenery?.bushA) return;
    const img = tinted(scenery.bushA, 'bushA', palette.foliageDark);
    if (!img) return;
    const y = worldHeight * 0.1;
    const size = MOLE_RADIUS * 2.6;
    for (let x = -size * 0.3; x < WORLD_WIDTH + size; x += size * 0.62) {
      const jx = (frand(x) - 0.5) * size * 0.3;
      c2d.drawImage(img, x + jx - size / 2, y - size / 2, size, size);
    }
  }

  // A continuous hedge across the whole row width. Because it is continuous (not
  // a per-cell marker), it hides WHERE in the row a monkey will pop.
  function drawHedge(row: number): void {
    if (!scenery) return;
    const rowCenterY = holes[row * GRID_COLS]!.y;
    const baseY = hedgeBaselineY(rowCenterY);
    const size = MOLE_RADIUS * 1.9;
    const step = size * 0.52;
    let i = 0;
    for (let x = -size * 0.4; x < WORLD_WIDTH + size; x += step, i++) {
      const seed = row * 97 + i;
      const src = frand(seed) < 0.5 ? scenery.bushA : scenery.bushB;
      if (!src) continue;
      const img = tinted(src, frand(seed) < 0.5 ? 'bushA' : 'bushB', palette.foliage);
      if (!img) continue;
      const s = size * (0.85 + frand(seed + 13) * 0.4);
      const jy = (frand(seed + 7) - 0.5) * size * 0.18;
      c2d.drawImage(img, x - s / 2, baseY - s * 0.62 + jy, s, s);
    }
  }

  function drawForegroundGrass(): void {
    if (!scenery?.grass) return;
    const img = tinted(scenery.grass, 'grass', palette.foliage);
    if (!img) return;
    const size = MOLE_RADIUS * 1.5;
    const y = worldHeight + size * 0.18;
    for (let x = -size * 0.3, i = 0; x < WORLD_WIDTH + size; x += size * 0.7, i++) {
      const jx = (frand(i * 31 + 5) - 0.5) * size * 0.3;
      c2d.drawImage(img, x + jx - size / 2, y - size, size, size);
    }
  }

  function drawMole(m: Mole): void {
    if (m.scaleY <= 0.01) return;
    const center = holes[m.holeIndex]!;
    const baseY = hedgeBaselineY(center.y);
    const punch = reducedMotion ? 1 : m.punch;
    const vScale = m.scaleY * punch;
    const hScale = (reducedMotion ? m.scaleY : Math.sqrt(1 / Math.max(0.05, m.scaleY))) * punch;
    const w = MOLE_RADIUS * 2 * hScale;
    const h = MOLE_RADIUS * 2 * vScale;
    c2d.save();
    // Only draw above the hedge baseline; the hedge (drawn after) covers the rest.
    c2d.beginPath();
    c2d.rect(center.x - MOLE_RADIUS * 1.6, center.y - MOLE_RADIUS * 2.6, MOLE_RADIUS * 3.2, baseY - (center.y - MOLE_RADIUS * 2.6));
    c2d.clip();
    const key: SpriteKey = m.kind === 'monkey' ? 'monkey' : (m.species ?? 'frog');
    const img = sprites ? sprites[key] : null;
    if (img) {
      c2d.drawImage(img, center.x - w / 2, baseY - h, w, h);
    } else {
      drawFallbackDisc(center.x, baseY - h / 2, (w + h) / 4, m.kind);
    }
    c2d.restore();
  }

  function drawFallbackDisc(x: number, y: number, r: number, kind: Mole['kind']): void {
    c2d.fillStyle = kind === 'monkey' ? '#A16639' : '#3FA34D';
    c2d.beginPath();
    c2d.arc(x, y, r, 0, Math.PI * 2);
    c2d.fill();
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
    c2d.fillRect(0, 0, WORLD_WIDTH, worldHeight);
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

  // Deterministic [0,1) hash for stable foliage jitter (does not consume the
  // gameplay rng, so spawn determinism is untouched).
  function frand(n: number): number {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function spawnParticles(x: number, y: number, color: string): void {
    if (reducedMotion) return;
    for (let i = 0; i < HIT_PARTICLES.count; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = rng() * HIT_PARTICLES.speed + 60;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        ttl: HIT_PARTICLES.ttl,
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
    if (dt > MAX_DT) dt = MAX_DT;
    if (status === 'playing' && dt > 0) update(dt);
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
    const showCounters = cfg.showScore;
    hud.goal.dataset['hidden'] = showCounters ? 'false' : 'true';
    hud.level.dataset['hidden'] = showCounters ? 'false' : 'true';
    hud.score.dataset['hidden'] = showCounters ? 'false' : 'true';
    if (showCounters) {
      // Before passing, show progress toward the goal; after, just the running
      // count (the round is now open-ended for score), mirroring fruit-slash.
      const goalText = verified ? `${round.goodHits}` : `${round.goodHits} / ${cfg.passHits}`;
      hud.goal.innerHTML = `<span class="label">${strings.t('headerGoal')}</span>${goalText}`;
      hud.level.innerHTML = `<span class="label">${strings.t('headerLevel')}</span>${levelIndex + 1}`;
      hud.score.innerHTML = `<span class="label">${strings.t('headerScore')}</span>${round.score}`;
    }
    updateTime();
    hud.badge.dataset['hidden'] = verified ? 'false' : 'true';
    hud.badge.textContent = `✓ ${strings.t('verifiedBadge')}`;
  }
  // The clock ticks every frame, so the time node updates on its own each frame
  // (cheaper than a full renderHud) and turns urgent in the last few seconds.
  function updateTime(): void {
    const secs = Math.max(0, Math.ceil(timeLeft));
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
