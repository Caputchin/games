// Live (browser) driver + renderer for Monkey Maze. It boots a live melonJS
// Application into the container and drives the SAME spec the server replays via
// the preset's createMelonDriver: a manual fixed-step loop calls driver.tick
// (which runs the real me.Body physics `world.update` inside the determinism
// trap), records the input trace, and renders the world. Because the live loop
// and the server replay drive the identical physics under the identical trap,
// the live outcome equals the replayed verdict.
//
// melonJS's own loop is NOT used (its world.update is not trap-wrapped); we drive
// update manually under the trap and render outside it. Input is DOM-driven
// (keyboard + touch tap/click-to-move); HUD / overlays / announcer are DOM for a11y.

// MUST be first: apply the transcendental Math swap before melonjs evaluates, so
// the live physics matches the server replay float-for-float (same swap the
// headless run installs via @caputchin/preset-melonjs/install). Side-effect
// import (no bindings).
import '@caputchin/preset-melonjs/live';
import type { Bridge, GameContext, Seed } from '@caputchin/game-sdk';
import { randomSeed } from '@caputchin/game-sdk';
import * as me from 'melonjs';
import { createMelonDriver, encodeTrace, FIXED_TIMESTEP_MS, type TickInput } from '@caputchin/preset-melonjs';
import { gameSpec } from './sim/engine.js';
import { TILE } from './sim/constants.js';
import { resolveSimConfig } from './sim/config.js';
import type { Dir, SimAction, SimState, SimView } from './sim/types.js';
import { buildStrings } from './strings.js';
import { createAnnouncer, prefersReducedMotion } from './a11y.js';
import { STYLES } from './styles.js';
import { resolvePalette, type Palette } from './palette.js';
import { loadArt, emptyArt, CHASER_ART, type ArtMap, type ArtKey } from './art.js';
import { createSfx } from './audio.js';

export interface GameOptions {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
}

const MAX_FRAME_DT = 100;

// The canvas backs the maze at this multiple of the sim grid (13*TILE = 208px),
// so a ~440px+ display upscales from 624px, not 208px - sprites + dots stay
// crisp instead of pixelated. Render only; the sim grid is unchanged.
const RENDER_SCALE = 3;

// Frightened chasers flash blue<->white over their last ~2s (FRIGHT_FLASH_TICKS
// of the fright timer), toggling every FRIGHT_FLASH_PERIOD ticks. Render only.
const FRIGHT_FLASH_TICKS = 120;
const FRIGHT_FLASH_PERIOD = 12;

let videoReady = false;

export function runMonkeyMaze(opts: GameOptions): () => void {
  const { container, bridge, ctx } = opts;
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? window;
  const strings = buildStrings(ctx?.locale as Record<string, unknown> | undefined);
  const palette = resolvePalette((ctx?.skin ?? null) as Record<string, unknown> | null);
  // Skin-configurable art (live render only). Start empty (procedural/fallback
  // defaults) and swap in the loaded images when ready; never blocks the round or
  // the verdict. Reads the site's `art_*` skin overrides, else bundled defaults.
  let art: ArtMap = emptyArt();
  const skinRec = (ctx?.skin ?? null) as Record<string, unknown> | null;
  void loadArt(doc, skinRec).then((a) => {
    art = a;
  });
  // Sound (live only). Default: the operator's `audio_default` skin key, overridden
  // by the player's persisted toggle. SFX unlock on the Play click (no autoplay).
  const operatorMuted = skinRec?.['audio_default'] === 'muted';
  let savedMute: string | null = null;
  try {
    savedMute = view.localStorage.getItem('mm-muted');
  } catch {
    /* sandboxed iframe may block localStorage */
  }
  let muted = savedMute !== null ? savedMute === '1' : operatorMuted;
  const sfx = createSfx(view as Window & typeof globalThis, skinRec, muted);
  const rawConfig = (ctx?.config ?? null) as Record<string, unknown> | null;
  void resolveSimConfig(rawConfig);
  const seed: Seed = (ctx?.seed as Seed | undefined) ?? randomSeed();
  const reducedMotion = prefersReducedMotion(view);

  // ---- DOM shell ----
  if (!doc.getElementById('mm-styles')) {
    const style = doc.createElement('style');
    style.id = 'mm-styles';
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }
  const root = el('div', 'mm-root');
  root.setAttribute('lang', strings.lang);
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', strings.t('ariaGame'));
  if (strings.direction === 'rtl') root.setAttribute('dir', 'rtl');
  for (const [k, v] of Object.entries(palette.vars)) root.style.setProperty(k, v);

  const hud = buildHud();
  function updateMute(): void {
    hud.mute.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    hud.mute.setAttribute('aria-label', muted ? strings.t('soundOff') : strings.t('soundOn'));
    hud.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  hud.mute.addEventListener('click', () => {
    muted = !muted;
    sfx.setMuted(muted);
    try {
      view.localStorage.setItem('mm-muted', muted ? '1' : '0');
    } catch {
      /* sandboxed iframe may block localStorage */
    }
    updateMute();
  });
  updateMute();
  const boardParent = el('div', 'mm-board');
  boardParent.id = `mm-canvas-${Math.floor(Math.random() * 1e9)}`;
  const overlay = el('div', 'mm-overlay');
  const announcer = createAnnouncer(doc);
  // Force a definite-height chain: the widget's iframe gives html/body/#cpt-root
  // no height, so height:100% on the root would collapse. The injected styles set
  // html+body to 100%; sizing the mount container to 100% here completes the
  // chain so the root fills the iframe footprint.
  container.style.height = '100%';
  container.style.width = '100%';
  root.append(hud.root, boardParent, overlay, announcer.element);
  container.appendChild(root);

  // ---- live melonJS Application (CANVAS, scaled to fill the board) ----
  const W = 13 * TILE;
  const Hh = 13 * TILE;
  if (!videoReady) {
    // Hi-res backing (RENDER_SCALE * the maze size); CSS (object-fit:contain)
    // scales the canvas element to fill the board. antiAlias smooths the scale
    // so the upscale is not blocky. Auto-scale sized the backing to the
    // pre-layout parent height and clipped the world to a strip, so we size it
    // explicitly. melonJS console noise is muted by the build banner (tsup.config).
    (me.video as unknown as { init(w: number, h: number, o: Record<string, unknown>): void }).init(
      W * RENDER_SCALE,
      Hh * RENDER_SCALE,
      {
        parent: boardParent,
        scale: 1,
        renderer: (me.video as unknown as { CANVAS: number }).CANVAS,
        antiAlias: true,
      },
    );
    videoReady = true;
  }
  // No bridge.setSize: that takes a DISPLAY pixel size, not the internal
  // resolution. The iframe is sized by the manifest `preferred` footprint; the
  // square aspect-ratio board + content-sized root fill it.
  const app = (me.game as unknown) as InstanceType<typeof me.Application>;

  // The preset driver builds the physics scene into app.world + owns the
  // trap-wrapped fixed-step advance (driver.tick).
  const built = createMelonDriver(gameSpec, app, { seed, config: rawConfig });
  const driver = built.driver;
  let state: SimState = built.state;
  let viewState: SimView = gameSpec.view ? (gameSpec.view(state) as SimView) : state;

  // Visual layer: a Renderable added to the world so melonJS draws it inside its
  // render cycle (the camera transform applies the design->canvas scale, which a
  // raw renderer.fillRect outside the cycle does not get). It draws the maze +
  // entities from the latest view; the physics bodies stay invisible.
  const RenderableCtor = me.Renderable as unknown as new (
    x: number, y: number, w: number, h: number,
  ) => { anchorPoint: { set(x: number, y: number): void }; floating: boolean };
  class Board extends (RenderableCtor as new (x: number, y: number, w: number, h: number) => object) {
    constructor() {
      super(0, 0, W * RENDER_SCALE, Hh * RENDER_SCALE);
      (this as unknown as { anchorPoint: { set(x: number, y: number): void } }).anchorPoint.set(0, 0);
      (this as unknown as { floating: boolean }).floating = true;
    }
    draw(r: Renderer): void {
      drawBoard(r, art, viewState, palette, reducedMotion);
    }
  }
  // The single persistent visual layer. Kept across rounds; clearRoundBodies
  // wipes only the physics bodies between rounds, never this.
  const board = new Board();
  const world = me.game.world as unknown as {
    addChild(c: unknown): void;
    removeChild(c: unknown, keepalive?: boolean): void;
    getChildren?(): unknown[];
    children?: unknown[];
  };
  world.addChild(board);

  // Remove every physics body the previous round added (walls + movers), keeping
  // the visual Board, so a re-built round (esp. a new maze) does not collide with
  // stale walls or stack orphaned bodies.
  function clearRoundBodies(): void {
    const kids = [...(world.getChildren ? world.getChildren() : (world.children ?? []))];
    for (const k of kids) {
      if (k === board) continue;
      try {
        world.removeChild(k, false);
      } catch {
        /* already detached */
      }
    }
  }

  // ---- driver bookkeeping ----
  let recorded: TickInput<SimAction>[] = [];
  let logicalTick = 0;
  let acc = 0;
  let running = false;
  // `verified` is permanent once the captcha passes (badge + bridge.pass guard).
  // `justVerified` is true only for the round that earned it (drives the end
  // message). Post-verify rounds are bonus levels: new random maze, clear-all.
  let verified = false;
  let justVerified = false;
  let lastFright = 0;
  // Previous-tick values for one-shot SFX edge detection (live render only).
  let prevPellets = viewState.pelletsLeft;
  let prevGhostsEaten = state.ghostsEatenThisFright;
  // Actions queued since the last tick (drained in order each tick, mirroring the
  // replay harness's per-tick bucket). heldDirs is the stack of currently-down
  // direction inputs (keyboard keys + d-pad buttons); its top is the active one.
  const pending: SimAction[] = [];
  const heldDirs: Dir[] = [];
  let rafHandle = 0;
  let disposed = false;
  let lastMs: number | null = null;

  const renderer = (me.video as unknown as { renderer: Renderer }).renderer;

  // The Play button is the SOLE way to (re)start a round - keys/taps NEVER start
  // it, they only move while a round is already running. This is deliberate: a
  // key held when the round ends (you lost mid-move) must not auto-restart, and
  // pressing an arrow on the win/lose screen must not move or restart.
  // A direction key/button went down: head that way (and keep going while held).
  function pressDir(d: Dir): void {
    if (!running) return; // not playing -> ignored; start via the Play button
    if (heldDirs.includes(d)) return; // ignore auto-repeat / duplicate source
    heldDirs.push(d);
    pending.push({ k: 'hold', d });
  }
  // A direction key/button went up: hand control to the next held one, else stop.
  function releaseDir(d: Dir): void {
    const i = heldDirs.indexOf(d);
    if (i >= 0) heldDirs.splice(i, 1);
    if (!running) return;
    const top = heldDirs[heldDirs.length - 1];
    pending.push(top === undefined ? { k: 'release' } : { k: 'hold', d: top });
  }
  // Click / tap a board cell: pathfind there (cancels any manual hold).
  function gotoCell(cx: number, cy: number): void {
    if (!running) return; // not playing -> ignored; start via the Play button
    heldDirs.length = 0;
    pending.push({ k: 'goto', cx, cy });
  }

  const KEYMAP: Record<string, Dir> = {
    ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3,
  };
  function onKeyDown(e: KeyboardEvent): void {
    const d = KEYMAP[e.code];
    if (d === undefined) return;
    e.preventDefault();
    if (e.repeat) return; // OS auto-repeat: only the deliberate first press counts
    pressDir(d);
  }
  function onKeyUp(e: KeyboardEvent): void {
    const d = KEYMAP[e.code];
    if (d === undefined) return;
    releaseDir(d);
  }
  function onBoardPointer(e: PointerEvent): void {
    const canvas = boardParent.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * viewState.cols);
    const gy = Math.floor(((e.clientY - rect.top) / rect.height) * viewState.rows);
    e.preventDefault();
    gotoCell(
      Math.max(0, Math.min(viewState.cols - 1, gx)),
      Math.max(0, Math.min(viewState.rows - 1, gy)),
    );
  }
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  boardParent.addEventListener('pointerdown', onBoardPointer);

  function advanceOneTick(): void {
    while (pending.length > 0) {
      const action = pending.shift() as SimAction;
      state = driver.step(state, action);
      recorded.push({ tick: logicalTick, action });
    }
    state = driver.tick(state);
    logicalTick += 1;
    viewState = gameSpec.view ? (gameSpec.view(state) as SimView) : state;

    const atePower = viewState.frightTimer > lastFright;
    if (atePower) announcer.say(strings.t('announcePower'));
    // SFX: a banana/coconut was eaten this tick if the count dropped (power if the
    // fright timer just (re)armed); a chaser was eaten if the chain count rose.
    // ghostsEatenThisFright + pelletsLeft are read from state (not view) because
    // they are AI-internal counters not exposed in the projected SimView.
    if (viewState.pelletsLeft < prevPellets) sfx.play(atePower ? 'power' : 'eat');
    if (state.ghostsEatenThisFright > prevGhostsEaten) sfx.play('eaten');
    lastFright = viewState.frightTimer;
    prevPellets = viewState.pelletsLeft;
    prevGhostsEaten = state.ghostsEatenThisFright;

    if (!verified && state.passed) {
      verified = true;
      justVerified = true;
      bridge.pass({ trace: encodeTrace(recorded) });
      announcer.say(strings.t('announceVerified'));
      sfx.play('win');
    }
    if (gameSpec.isOver(state)) endRound();
  }

  function startRun(): void {
    running = true;
    pending.length = 0;
    heldDirs.length = 0;
    prevPellets = viewState.pelletsLeft;
    prevGhostsEaten = state.ghostsEatenThisFright;
    overlay.dataset['shown'] = 'false';
    overlay.replaceChildren();
    announcer.say(strings.t('announceStart'));
    sfx.resume(); // unlock audio on this user gesture
    sfx.play('start');
  }
  function endRound(): void {
    running = false;
    const won = viewState.status === 'won';
    // Message reflects THIS round: the round that earned verification shows the
    // verified celebration; a bonus level fully cleared shows "cleared"; a catch
    // shows "caught" (the user keeps any verification already earned).
    const msg = justVerified ? strings.t('verified') : won ? strings.t('cleared') : strings.t('caught');
    if (won) {
      announcer.say(strings.t('announceCleared'));
      sfx.play('win');
    } else if (viewState.status === 'caught') {
      announcer.say(strings.t('announceCaught'));
      sfx.play('caught');
    }
    showOverlay(msg);
  }
  function restart(): void {
    // Once verified, every "Play again" is a fresh BONUS level: a new random maze
    // (no replay needed post-verification, so reseeding locally is safe) that must
    // be cleared completely (clear-all). Before verification a retry must reuse
    // the issued seed + config so the live play stays replayable.
    const roundSeed: Seed = verified ? randomSeed() : seed;
    const roundConfig: Record<string, unknown> | null = verified
      ? { ...(rawConfig ?? {}), clear_percent: 100 }
      : rawConfig;
    clearRoundBodies();
    const rebuilt = createMelonDriver(gameSpec, app, { seed: roundSeed, config: roundConfig });
    state = rebuilt.state;
    (driver as unknown as { api: unknown }).api = (rebuilt.driver as unknown as { api: unknown }).api;
    Object.assign(driver, rebuilt.driver);
    recorded = [];
    logicalTick = 0;
    acc = 0;
    justVerified = false; // verification status itself persists across rounds
    lastFright = 0;
    viewState = gameSpec.view ? (gameSpec.view(state) as SimView) : state;
    startRun(); // also clears pending input + heldDirs
    renderHud();
  }

  // ---- manual fixed-step loop (no melonJS auto-loop) ----
  function frame(tMs: number): void {
    if (disposed) return;
    let dt = lastMs === null ? 0 : tMs - lastMs;
    lastMs = tMs;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (running) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_TIMESTEP_MS && running && steps < 10) {
        advanceOneTick();
        acc -= FIXED_TIMESTEP_MS;
        steps += 1;
      }
    }
    renderFrame();
    renderHud();
    rafHandle = view.requestAnimationFrame(frame);
  }

  function renderFrame(): void {
    // Render the world through melonJS so the camera scale transform applies.
    const r = renderer as unknown as { clear?(): void; flush?(): void };
    r.clear?.();
    const world = me.game.world as unknown;
    const cam = me.game.viewport as unknown as { draw?(rr: unknown, w: unknown): void } | undefined;
    if (cam && typeof cam.draw === 'function') cam.draw(renderer, world);
    else (world as { draw(rr: unknown): void }).draw(renderer);
    r.flush?.();
  }

  function renderHud(): void {
    // totalDots and passDots are AI-internal scheduling fields not exposed in
    // the projected SimView; read them from state (live-driver-owned).
    const eaten = state.totalDots - viewState.pelletsLeft;
    hud.score.textContent = `${strings.t('score')}: ${viewState.score}`;
    hud.goal.textContent = `${strings.t('goal')}: ${eaten}/${state.passDots}`;
    hud.dots.textContent = `${strings.t('dotsLeft')}: ${viewState.pelletsLeft}`;
    hud.badge.dataset['shown'] = verified ? 'true' : 'false';
    hud.badge.textContent = `✓ ${strings.t('verified')}`;
  }

  function showOverlay(message: string): void {
    overlay.dataset['shown'] = 'true';
    const card = el('div', 'mm-card');
    const text = el('div', 'mm-card-text');
    text.textContent = message;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-btn';
    btn.textContent = logicalTick === 0 && !verified ? strings.t('start') : strings.t('retry');
    btn.addEventListener('click', () => {
      if (logicalTick === 0 && !verified && state.status === 'playing') startRun();
      else restart();
      overlay.dataset['shown'] = 'false';
      overlay.replaceChildren();
    });
    card.append(text, btn);
    overlay.replaceChildren(card);
    btn.focus();
  }

  // ---- boot ----
  renderFrame();
  renderHud();
  // The start card states the OBJECTIVE (with the live goal count); the button
  // is the action ("Play"). No more duplicated "how to start" text.
  showOverlay(strings.t('objective', { goal: state.passDots }));
  rafHandle = view.requestAnimationFrame(frame);

  // ---- helpers ----
  function el(tag: string, className: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  }
  function buildHud(): {
    root: HTMLElement; score: HTMLElement; goal: HTMLElement; dots: HTMLElement;
    badge: HTMLElement; mute: HTMLButtonElement;
  } {
    const r = el('div', 'mm-hud');
    const score = el('span', 'mm-hud-score');
    const goal = el('span', 'mm-hud-goal');
    const dots = el('span', 'mm-hud-dots');
    const badge = el('span', 'mm-badge');
    badge.dataset['shown'] = 'false';
    const mute = doc.createElement('button');
    mute.type = 'button';
    mute.className = 'mm-mute';
    r.append(score, goal, dots, badge, mute);
    return { root: r, score, goal, dots, badge, mute };
  }

  return function cleanup(): void {
    disposed = true;
    view.cancelAnimationFrame(rafHandle);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('keyup', onKeyUp);
    boardParent.removeEventListener('pointerdown', onBoardPointer);
    root.remove();
  };
}

interface Renderer {
  clear?(): void;
  flush?(): void;
  /** The 2D context (CANVAS renderer). drawBoard scales it by RENDER_SCALE and
   *  draws everything (maze, dots, sprites) on it, so the whole board renders at
   *  the hi-res backing. */
  getContext(): CanvasRenderingContext2D;
}

/** Filled circle in world coords (round pellets, fallback discs, eyes). */
function disc(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, radius: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** A sprite centered on (cx, cy), scaled to `size`. */
function drawSprite(ctx: CanvasRenderingContext2D, img: CanvasImageSource, cx: number, cy: number, size: number): void {
  const half = size / 2;
  ctx.drawImage(img, cx - half, cy - half, size, size);
}

/** A flat banana (the pellet): a FAT crescent built from cubic beziers that meet
 *  at pointed tips (reads as a banana, not a peanut/sliver), with a brown stem
 *  nub and a belly highlight. `len` is roughly half the banana's length. */
function drawBanana(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.55);
  // body: outer belly bulges far right, inner edge bulges less -> a fat crescent
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -len); // top tip
  ctx.bezierCurveTo(len * 1.15, -len * 0.55, len * 1.15, len * 0.55, 0, len); // outer belly
  ctx.bezierCurveTo(len * 0.32, len * 0.45, len * 0.32, -len * 0.45, 0, -len); // inner edge
  ctx.closePath();
  ctx.fill();
  // belly highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = len * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(len * 0.55, -len * 0.4);
  ctx.bezierCurveTo(len * 0.82, 0, len * 0.82, 0, len * 0.55, len * 0.4);
  ctx.stroke();
  // brown stem nub at the top tip
  disc(ctx, '#5a3c18', 0, -len, len * 0.2);
  ctx.restore();
}

/** A flat coconut (the power dot): a round shell with three dark germination
 *  pores (the coconut "face") + a soft top highlight. */
function drawCoconut(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  disc(ctx, color, cx, cy, r);
  disc(ctx, 'rgba(255,255,255,0.22)', cx - r * 0.28, cy - r * 0.3, r * 0.42);
  disc(ctx, '#3a2410', cx - r * 0.33, cy - r * 0.18, r * 0.16);
  disc(ctx, '#3a2410', cx + r * 0.33, cy - r * 0.18, r * 0.16);
  disc(ctx, '#3a2410', cx, cy + r * 0.28, r * 0.16);
}

/** A leafy hedge tile (one wall cell): a rounded base in the skin wall color +
 *  relative light/dark leaf clumps (alpha overlays, so it themes with any skin).
 *  `seed` (the cell index) varies the clumps so the hedge doesn't look stamped. */
function drawWallTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, seed: number): void {
  const r2 = ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
  ctx.fillStyle = color;
  if (typeof r2.roundRect === 'function') {
    ctx.beginPath();
    r2.roundRect(x + 0.4, y + 0.4, TILE - 0.8, TILE - 0.8, TILE * 0.24);
    ctx.fill();
  } else {
    ctx.fillRect(x + 0.4, y + 0.4, TILE - 0.8, TILE - 0.8);
  }
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const j = (seed % 3) * 0.06 - 0.06; // tiny deterministic jitter
  disc(ctx, 'rgba(255,255,255,0.15)', cx - TILE * (0.2 + j), cy - TILE * 0.22, TILE * 0.21);
  disc(ctx, 'rgba(255,255,255,0.1)', cx + TILE * 0.22, cy - TILE * (0.04 - j), TILE * 0.15);
  disc(ctx, 'rgba(0,0,0,0.16)', cx + TILE * (0.18 - j), cy + TILE * 0.24, TILE * 0.19);
}

/** Procedural jungle backdrop: the skin bg, a few faint canopy-leaf shapes, and a
 *  soft edge vignette - depth without a bitmap, kept subtle so dots/walls stay
 *  legible. */
function drawJungleBg(ctx: CanvasRenderingContext2D, cols: number, rows: number, palette: Palette): void {
  const w = cols * TILE;
  const h = rows * TILE;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);
  // faint canopy leaves (deterministic positions)
  const leaves: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.18, 0.12, 0.26, -0.6],
    [0.82, 0.2, 0.3, 0.5],
    [0.7, 0.85, 0.24, -0.4],
    [0.25, 0.78, 0.28, 0.7],
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (const [fx, fy, fr, rot] of leaves) {
    ctx.save();
    ctx.translate(fx * w, fy * h);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, fr * w, fr * w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // edge vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.32, w / 2, h / 2, w * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawBoard(
  renderer: Renderer,
  art: ArtMap,
  v: SimView,
  palette: Palette,
  _reduced: boolean,
): void {
  const { cols, rows } = v;
  const walls = v.walls;
  const ctx = renderer.getContext();
  ctx.save();
  // Draw in sim-pixel (logical) coords; scale once to the hi-res backing.
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.imageSmoothingEnabled = true;

  drawJungleBg(ctx, cols, rows, palette);

  // leafy hedge walls (or the skin's art_wall image per cell)
  for (let i = 0; i < walls.length; i += 1) {
    if (!walls[i]) continue;
    const wx = (i % cols) * TILE;
    const wy = Math.floor(i / cols) * TILE;
    if (art.wall) ctx.drawImage(art.wall, wx, wy, TILE, TILE);
    else drawWallTile(ctx, wx, wy, palette.wall, i);
  }

  // bananas (dots) + coconuts (power dots) - or the skin's art override
  for (let i = 0; i < v.pellets.length; i += 1) {
    const p = v.pellets[i] ?? 0;
    if (p === 0) continue;
    const cx = (i % cols) * TILE + TILE / 2;
    const cy = Math.floor(i / cols) * TILE + TILE / 2;
    if (p === 2) {
      if (art.coconut) drawSprite(ctx, art.coconut, cx, cy, TILE * 0.66);
      else drawCoconut(ctx, cx, cy, TILE * 0.3, palette.power);
    } else if (art.banana) {
      drawSprite(ctx, art.banana, cx, cy, TILE * 0.55);
    } else {
      drawBanana(ctx, cx, cy, TILE * 0.34, palette.pellet);
    }
  }

  // chasers: normal = species sprite; frightened = blue disc; eaten = eyes only.
  for (const g of v.ghosts) {
    const cx = g.x + TILE / 2;
    const cy = g.y + TILE / 2;
    if (g.mode === 'eaten') {
      disc(ctx, '#eef3ff', cx - TILE * 0.18, cy - TILE * 0.05, TILE * 0.12);
      disc(ctx, '#eef3ff', cx + TILE * 0.18, cy - TILE * 0.05, TILE * 0.12);
      continue;
    }
    if (g.mode === 'frightened') {
      // In the final stretch (~2s), flash blue<->white so the player sees
      // frightened is about to wear off. Render-only, derived from the timer.
      const flashing = v.frightTimer <= FRIGHT_FLASH_TICKS
        && Math.floor(v.frightTimer / FRIGHT_FLASH_PERIOD) % 2 === 0;
      disc(ctx, flashing ? '#eef3ff' : palette.frightened, cx, cy, TILE * 0.46);
      // Eyes flip dark on the white flash frame so they stay visible.
      const eye = flashing ? '#1a1a2e' : '#eef3ff';
      disc(ctx, eye, cx - TILE * 0.16, cy - TILE * 0.04, TILE * 0.07);
      disc(ctx, eye, cx + TILE * 0.16, cy - TILE * 0.04, TILE * 0.07);
      continue;
    }
    const img = art[CHASER_ART[g.kind % CHASER_ART.length] as ArtKey];
    if (img) drawSprite(ctx, img, cx, cy, TILE * 1.18);
    else disc(ctx, palette.ghost[g.kind % palette.ghost.length] ?? '#ff5b5b', cx, cy, TILE * 0.42);
  }

  // runner (the capuchin) - or the skin's art_runner image
  const rx = v.runner.x + TILE / 2;
  const ry = v.runner.y + TILE / 2;
  if (art.runner) drawSprite(ctx, art.runner, rx, ry, TILE * 1.22);
  else disc(ctx, palette.runner, rx, ry, TILE * 0.44);

  ctx.restore();
}
