// Browser-only render, touch, and juice. Never runs headless (game.ts guards on
// api.headless), so nothing here can touch the verdict. It is a pure projection
// of the sim state plus DIRECT touch controls (no on-screen buttons) and a
// transient effects layer (line-clear flash + particles + shake, lock pop, score
// popups) that the sim raises events into.
//
// Determinism note: all touch input is injected ONLY from real pointer-event
// handlers (the same frame phase the preset's keyboard binding uses), so the
// recorded trace replays identically. Nothing in the effects layer reads the
// seeded RNG; animation is driven by the frame dt, so it can never perturb the
// sim's stream.

import type { KAPLAYCtx } from 'kaplay';
import type { KaplayGameApi } from '@caputchin/preset-kaplay';
import type { Active, Board, SimConfig } from './sim/types.js';
import { pieceCells, collides } from './sim/board.js';
import { dragTargetLeft } from './drag.js';
import type { Strings } from './strings.js';
import { resolvePalette, hexRgb, type Palette } from './palette.js';
import type { Audio } from './audio.js';

export interface View {
  board: Board;
  active: Active | null;
  score: number;
  lines: number;
  cfg: SimConfig;
  over: boolean;
  passed: boolean;
  /** False while the start screen is up; the sim is frozen until the player begins. */
  started: boolean;
  /** Sticky once the pass threshold is first reached (survives fun restarts). */
  verified: boolean;
  /** The verified congratulation prompt is up; the sim is frozen until "keep playing". */
  verifiedPause: boolean;
}

/** Visual + audio cues the sim raises; the renderer turns them into effects. */
export interface Fx {
  /** `count` lines cleared this tick. */
  onClear(count: number): void;
  /** A piece locked (no clear). */
  onLock(): void;
  /** The round was passed. */
  onPass(): void;
  /** Topped out. */
  onFail(): void;
}

interface Layout {
  cell: number;
  ox: number;
  oy: number;
  bw: number;
  bh: number;
  hudH: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: readonly [number, number, number];
}

interface Popup {
  x: number;
  y: number;
  life: number;
  text: string;
}

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function computeLayout(W: number, H: number, cols: number, rows: number): Layout {
  // Pad off the SMALLER dimension so a wide/tall container doesn't inflate the
  // margin and shrink the board - the board scales up to fill the binding axis,
  // centered (the default 270x480 is unchanged: W is the smaller side there).
  const pad = Math.max(8, Math.round(Math.min(W, H) * 0.04));
  const hudH = Math.max(22, Math.round(H * 0.08));
  const availW = W - pad * 2;
  const availH = H - hudH - pad * 2;
  const cell = Math.max(8, Math.floor(Math.min(availW / cols, availH / rows)));
  const bw = cell * cols;
  const bh = cell * rows;
  const ox = Math.floor((W - bw) / 2);
  const oy = hudH + pad + Math.floor((availH - bh) / 2);
  return { cell, ox, oy, bw, bh, hudH };
}

/** Where the active piece would come to rest if hard-dropped now. */
function landing(a: Active, board: Board, cfg: SimConfig): Active {
  let y = a.y;
  while (!collides(board, pieceCells({ ...a, y: y + 1 }), cfg.cols, cfg.rows)) y++;
  return { ...a, y };
}

function shade(rgb: readonly [number, number, number], f: number): [number, number, number] {
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(rgb[0]), c(rgb[1]), c(rgb[2])];
}

/** Draw rect of the mute toggle, in the HUD's left slot. */
function muteRect(L: Layout): { x: number; y: number; w: number; h: number } {
  const s = Math.max(18, Math.min(L.hudH, 24));
  return { x: L.ox, y: Math.max(1, (L.hudH - s) / 2), w: s, h: s };
}

/**
 * Tap target of the mute toggle - the full top-left HUD corner, larger than the
 * glyph so the touch target is forgiving (toward the 44px guideline) without
 * enlarging the icon. Bounded to the HUD band (no board overlap) and stops short
 * of the score label, so it never swallows a board / start tap.
 */
function muteHitRect(L: Layout): { x: number; y: number; w: number; h: number } {
  const m = muteRect(L);
  return { x: 0, y: 0, w: m.x + m.w + 6, h: L.hudH };
}

export function setupRender(k: KAPLAYCtx, api: KaplayGameApi, strings: Strings, getView: () => View, audio: Audio): Fx {
  const pal: Palette = resolvePalette(api.ctx?.skin ?? null);
  const rgb = (hex: string): readonly [number, number, number] => hexRgb(hex);
  const col = (c: readonly [number, number, number]): ReturnType<KAPLAYCtx['rgb']> => k.rgb(c[0], c[1], c[2]);
  const pieceRgb = pal.pieces.map(rgb);
  // The HUD (score / lines / mute) sits on the game's fixed dark chrome (the
  // kaplay canvas background in game.ts), NOT on the skinnable well. So its
  // foreground is a fixed light color: pal.text flips to dark under a light skin
  // and would vanish against the dark chrome.
  const hudFg = rgb('#e6e9f5');

  let shakeMag = 0;
  let flash = 0;
  let lockPop = 0;
  let passGlow = 0;
  let clock = 0;
  const particles: Particle[] = [];
  const popups: Popup[] = [];

  function curLayout(): Layout {
    return computeLayout(k.width(), k.height(), getView().cfg.cols, getView().cfg.rows);
  }

  // --- the beveled cell (base + top highlight + bottom shadow) ---
  function drawCell(L: Layout, dx: number, c: number, r: number, base: readonly [number, number, number], pop = 0): void {
    if (r < 0) return;
    const g = L.cell - 2 + pop;
    const x = L.ox + dx + c * L.cell + 1 - pop / 2;
    const y = L.oy + r * L.cell + 1 - pop / 2;
    const rad = Math.min(5, L.cell * 0.22);
    k.drawRect({ pos: k.vec2(x, y), width: g, height: g, radius: rad, color: col(base) });
    k.drawRect({
      pos: k.vec2(x + 1, y + 1),
      width: g - 2,
      height: Math.max(2, L.cell * 0.18),
      radius: rad,
      color: col(shade(base, 1.4)),
      opacity: 0.75,
    });
    k.drawRect({
      pos: k.vec2(x + 1, y + g - Math.max(2, L.cell * 0.2)),
      width: g - 2,
      height: Math.max(2, L.cell * 0.16),
      radius: rad,
      color: col(shade(base, 0.55)),
      opacity: 0.65,
    });
  }

  function drawGhost(L: Layout, dx: number, c: number, r: number, base: readonly [number, number, number]): void {
    if (r < 0) return;
    const x = L.ox + dx + c * L.cell + 1;
    const y = L.oy + r * L.cell + 1;
    k.drawRect({
      pos: k.vec2(x, y),
      width: L.cell - 2,
      height: L.cell - 2,
      radius: Math.min(5, L.cell * 0.22),
      fill: false,
      outline: { color: col(base), width: Math.max(2, L.cell * 0.08) },
      opacity: 0.45,
    });
  }

  function drawMute(m: { x: number; y: number; w: number; h: number }): void {
    const cy = m.y + m.h / 2;
    const s = m.h;
    // The fixed light chrome foreground (the HUD is on the dark game chrome, not
    // the themed well) - the muted state is shown by a red slash, NOT by dimming
    // the speaker, so it never washes out against the background.
    const fg = col(hudFg);
    const stroke = Math.max(2, s * 0.1);
    // Speaker: a filled cone (a trapezoid - narrow magnet on the left, wide mouth
    // on the right) opening toward the waves, the standard volume-icon silhouette.
    const mouth = m.x + s * 0.44;
    k.drawPolygon({
      pts: [
        k.vec2(m.x + s * 0.06, cy - s * 0.16),
        k.vec2(mouth, cy - s * 0.36),
        k.vec2(mouth, cy + s * 0.36),
        k.vec2(m.x + s * 0.06, cy + s * 0.16),
      ],
      color: fg,
    });
    if (audio.muted) {
      // A bold diagonal slash across the speaker = sound off.
      k.drawLine({
        p1: k.vec2(m.x + s * 0.52, cy - s * 0.36),
        p2: k.vec2(m.x + s * 0.98, cy + s * 0.36),
        width: stroke,
        color: col(rgb(pal.danger)),
      });
    } else {
      // Two concentric arcs from the mouth = sound waves, same color as the
      // speaker so it reads as one clean monochrome icon.
      for (const rr of [s * 0.26, s * 0.44]) {
        k.drawCircle({ pos: k.vec2(mouth, cy), radius: rr, start: -52, end: 52, fill: false, outline: { color: fg, width: stroke } });
      }
    }
  }

  // --- effects timestep (frame dt; never touches the sim) ---
  k.onUpdate(() => {
    const dt = Math.min(0.05, k.dt());
    clock += dt;
    shakeMag = Math.max(0, shakeMag - dt * 36);
    flash = Math.max(0, flash - dt * 4);
    lockPop = Math.max(0, lockPop - dt * 24);
    passGlow = Math.max(0, passGlow - dt * 1.5);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]!;
      p.life -= dt;
      if (p.life <= 0) popups.splice(i, 1);
      else if (!REDUCED) p.y -= 38 * dt;
    }
  });

  k.onDraw(() => {
    const v = getView();
    const L = curLayout();
    // screen shake offset (board only), smooth + decaying
    const sx = REDUCED ? 0 : Math.cos(clock * 47) * shakeMag;
    const sy = REDUCED ? 0 : Math.sin(clock * 53) * shakeMag;

    // well + faint grid
    k.drawRect({ pos: k.vec2(L.ox - 3 + sx, L.oy - 3 + sy), width: L.bw + 6, height: L.bh + 6, radius: 8, color: col(rgb(pal.grid)) });
    k.drawRect({ pos: k.vec2(L.ox + sx, L.oy + sy), width: L.bw, height: L.bh, radius: 5, color: col(rgb(pal.well)) });
    for (let c = 1; c < v.cfg.cols; c++) {
      k.drawRect({ pos: k.vec2(L.ox + sx + c * L.cell, L.oy + sy), width: 1, height: L.bh, color: col(rgb(pal.grid)), opacity: 0.5 });
    }
    for (let r = 1; r < v.cfg.rows; r++) {
      k.drawRect({ pos: k.vec2(L.ox + sx, L.oy + sy + r * L.cell), width: L.bw, height: 1, color: col(rgb(pal.grid)), opacity: 0.5 });
    }

    // locked cells (the wall + landed pieces)
    for (let r = 0; r < v.cfg.rows; r++) {
      const row = v.board[r]!;
      for (let c = 0; c < v.cfg.cols; c++) {
        const t = row[c]!;
        if (t !== 0) drawCell(L, sx, c, r, pieceRgb[t - 1]!);
      }
    }

    // ghost (landing preview) + active piece
    if (v.active && !v.over) {
      const base = pieceRgb[v.active.type]!;
      const ghost = landing(v.active, v.board, v.cfg);
      for (const [c, r] of pieceCells(ghost)) drawGhost(L, sx, c, r, base);
      for (const [c, r] of pieceCells(v.active)) drawCell(L, sx, c, r, base, lockPop * L.cell * 0.12);
    }

    // line-clear flash over the board
    if (flash > 0) {
      k.drawRect({ pos: k.vec2(L.ox + sx, L.oy + sy), width: L.bw, height: L.bh, radius: 5, color: k.rgb(255, 255, 255), opacity: Math.min(0.85, flash * 0.85) });
    }

    // particles
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      k.drawRect({ pos: k.vec2(p.x, p.y), width: p.size, height: p.size, radius: 2, anchor: 'center', color: col(p.color), opacity: a });
    }

    // HUD (kept small so the two labels never collide on a narrow board)
    const hud = Math.max(11, Math.min(17, Math.round(L.cell * 0.46)));
    const hudY = Math.max(2, (L.hudH - hud) / 2);
    const mr = muteRect(L);
    if (audio.enabled) drawMute(mr);
    const scoreX = audio.enabled ? mr.x + mr.w + 4 : L.ox + 1;
    k.drawText({ text: `${strings.t('scoreLabel')} ${v.score}`, pos: k.vec2(scoreX, hudY), size: hud, color: col(hudFg) });
    k.drawText({
      text: `${strings.t('linesLabel')} ${v.lines}/${v.cfg.passLines}`,
      pos: k.vec2(L.ox + L.bw - 1, hudY),
      size: hud,
      anchor: 'topright',
      color: col(v.passed ? rgb(pal.accent) : hudFg),
    });

    // score popups
    for (const p of popups) {
      const a = Math.max(0, Math.min(1, p.life * 1.5));
      k.drawText({ text: p.text, pos: k.vec2(p.x + sx, p.y + sy), size: Math.round(L.cell * 0.7), anchor: 'center', color: col(rgb(pal.accent)), opacity: a });
    }

    // overlays
    if (v.verifiedPause) drawVerified(L);
    else if (!v.started && !v.over) drawStart(L);
    else if (v.over) drawPanel(L);
    else if (v.verified) drawBadge(L, sx, sy);
  });

  function drawStart(L: Layout): void {
    k.drawRect({ pos: k.vec2(L.ox, L.oy), width: L.bw, height: L.bh, radius: 5, color: k.rgb(8, 9, 14), opacity: 0.9 });
    const cx = L.ox + L.bw / 2;
    k.drawText({ text: 'Blockfall', pos: k.vec2(cx, L.oy + L.bh * 0.11), size: Math.min(24, L.bw * 0.1), anchor: 'center', color: col(rgb(pal.accent)) });
    // Readable body; the button is anchored to the bottom (below) so a long
    // locale grows the text block toward it but never pushes it off-screen.
    k.drawText({
      text: strings.t('startBody', { n: getView().cfg.passLines }),
      pos: k.vec2(cx, L.oy + L.bh * 0.26),
      size: Math.min(15, Math.max(12, L.bw * 0.06)),
      width: L.bw * 0.86,
      align: 'center',
      anchor: 'top',
      color: k.rgb(255, 255, 255),
    });
    // Start button (the whole overlay is also tappable; this is the affordance).
    const bbw = Math.min(L.bw * 0.62, 160);
    const bbh = Math.max(30, Math.min(L.cell * 1.2, L.bh * 0.14));
    const bx = cx - bbw / 2;
    const by = L.oy + L.bh - bbh - L.bh * 0.08;
    const pulse = REDUCED ? 1 : 0.8 + Math.sin(clock * 4) * 0.2;
    k.drawRect({ pos: k.vec2(bx, by), width: bbw, height: bbh, radius: bbh / 2, color: col(rgb(pal.accent)), opacity: pulse });
    k.drawText({ text: strings.t('startButton'), pos: k.vec2(cx, by + bbh / 2), size: bbh * 0.44, anchor: 'center', color: k.rgb(12, 14, 22) });
  }

  function drawBadge(L: Layout, sx: number, sy: number): void {
    const glow = REDUCED ? 1 : 0.6 + Math.sin(clock * 4) * 0.4 * Math.min(1, passGlow);
    const w = Math.min(L.bw - 8, 190);
    const h = Math.max(22, L.cell * 1.1);
    const x = L.ox + (L.bw - w) / 2 + sx;
    const y = L.oy + 8 + sy;
    k.drawRect({ pos: k.vec2(x, y), width: w, height: h, radius: h / 2, color: col(rgb(pal.accent)), opacity: glow });
    k.drawText({ text: `✓ ${strings.t('verifiedTitle')}`, pos: k.vec2(x + w / 2, y + h / 2), size: h * 0.5, anchor: 'center', color: k.rgb(12, 14, 22) });
  }

  // A pulsing pill button centred in the lower part of a panel (the whole panel
  // is also tappable; this is the affordance). Shared by the verified + end panels.
  function drawButton(x: number, w: number, y: number, h: number, label: string): void {
    const bbw = Math.min(w * 0.72, 150);
    const bbh = Math.max(28, h * 0.26);
    const bx = x + (w - bbw) / 2;
    const by = y + h - bbh - h * 0.1;
    const pulse = REDUCED ? 1 : 0.82 + Math.sin(clock * 4) * 0.18;
    k.drawRect({ pos: k.vec2(bx, by), width: bbw, height: bbh, radius: bbh / 2, color: col(rgb(pal.accent)), opacity: pulse });
    // Shrink the label to fit the pill so a long locale (e.g. de "Nochmal
    // versuchen") never clips on a narrow board; short labels keep the base size.
    const size = Math.min(bbh * 0.44, (bbw * 0.86) / Math.max(1, label.length * 0.58));
    k.drawText({ text: label, pos: k.vec2(x + w / 2, by + bbh / 2), size, anchor: 'center', color: k.rgb(12, 14, 22) });
  }

  // Shown the moment the pass threshold is reached: the sim freezes, we
  // congratulate, and the button keeps playing the SAME board (the verdict is
  // already sent, so this is purely for fun).
  function drawVerified(L: Layout): void {
    const w = Math.min(L.bw - 8, 210);
    const h = Math.max(112, L.bh * 0.36);
    const x = L.ox + (L.bw - w) / 2;
    const y = L.oy + (L.bh - h) / 2;
    k.drawRect({ pos: k.vec2(x, y), width: w, height: h, radius: 10, color: k.rgb(8, 9, 14), opacity: 0.95 });
    k.drawText({ text: `✓ ${strings.t('verifiedTitle')}`, pos: k.vec2(x + w / 2, y + h * 0.2), size: Math.min(22, h * 0.18), anchor: 'center', color: col(rgb(pal.accent)) });
    k.drawText({
      text: strings.t('verifiedBody'),
      pos: k.vec2(x + w / 2, y + h * 0.4),
      size: Math.min(14, h * 0.11),
      width: w * 0.84,
      align: 'center',
      anchor: 'top',
      color: k.rgb(255, 255, 255),
    });
    drawButton(x, w, y, h, strings.t('keepPlaying'));
  }

  function drawPanel(L: Layout): void {
    const v = getView();
    const w = Math.min(L.bw - 8, 210);
    const h = Math.max(98, L.bh * 0.32);
    const x = L.ox + (L.bw - w) / 2;
    const y = L.oy + (L.bh - h) / 2;
    k.drawRect({ pos: k.vec2(x, y), width: w, height: h, radius: 10, color: k.rgb(8, 9, 14), opacity: 0.95 });
    // Verified players who topped out still see the positive title; only an
    // unverified top-out is the red "failure".
    const title = v.verified ? strings.t('verifiedTitle') : strings.t('gameOverTitle');
    k.drawText({ text: title, pos: k.vec2(x + w / 2, y + h * 0.22), size: Math.min(22, h * 0.2), anchor: 'center', color: col(rgb(v.verified ? pal.accent : pal.danger)) });
    k.drawText({ text: `${strings.t('scoreLabel')} ${v.score}`, pos: k.vec2(x + w / 2, y + h * 0.44), size: Math.min(15, h * 0.13), anchor: 'center', color: k.rgb(255, 255, 255) });
    // Start a fresh puzzle: "Play again" for fun once verified, else "Try again".
    drawButton(x, w, y, h, v.verified ? strings.t('playAgain') : strings.t('tryAgain'));
  }

  // --- juice spawners (sim -> effects) ---
  function spawnClear(count: number): void {
    const L = curLayout();
    flash = Math.min(1, 0.5 + count * 0.18);
    shakeMag = REDUCED ? 0 : Math.min(10, 3 + count * 2.5);
    popups.push({ x: L.ox + L.bw / 2, y: L.oy + L.bh - L.cell * 1.2, life: 0.9, text: count >= 2 ? `+${count} LINES` : '+1' });
    if (REDUCED) return;
    const n = 14 + count * 8;
    const bandY = L.oy + L.bh - L.cell * getView().cfg.passLines * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const ang = -Math.PI / 2 + (t - 0.5) * 1.7;
      const spd = 130 + (i % 5) * 55;
      particles.push({
        x: L.ox + L.bw * t,
        y: bandY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.55,
        max: 0.55,
        size: Math.max(3, L.cell * 0.28),
        color: pieceRgb[i % pieceRgb.length]!,
      });
    }
  }

  return {
    onClear(count: number): void {
      spawnClear(count);
      audio.clear(count);
    },
    onLock(): void {
      lockPop = REDUCED ? 0 : 1;
      if (!REDUCED) shakeMag = Math.max(shakeMag, 1.5);
      audio.lock();
    },
    onPass(): void {
      passGlow = 1;
      flash = Math.max(flash, 0.6);
      audio.pass();
    },
    onFail(): void {
      if (!REDUCED) shakeMag = Math.max(shakeMag, 6);
      audio.fail();
    },
  };
}

/**
 * Direct touch: DRAG the piece left/right (it tracks your finger), LIFT to drop,
 * quick TAP to rotate. All injection happens inside the pointer handlers, the same
 * frame phase the keyboard binding uses, so the recorded trace replays exactly.
 */
export function setupTouch(k: KAPLAYCtx, api: KaplayGameApi, getView: () => View, audio: Audio): void {
  let pressing = false;
  let startX = 0;
  let startY = 0;
  let startClock = 0;
  let moved = 0;

  const tapAction = (action: string): void => {
    api.press(action);
    api.release(action);
  };
  const layout = (): Layout => {
    const v = getView();
    return computeLayout(k.width(), k.height(), v.cfg.cols, v.cfg.rows);
  };

  k.onMousePress(() => {
    const v = getView();
    const p = k.mousePos();
    const L = layout();
    // Mute toggle (tappable in any state).
    if (audio.enabled) {
      const m = muteHitRect(L);
      if (p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) {
        audio.toggleMute();
        return;
      }
    }
    if (v.verifiedPause) {
      // Verified prompt is up: a tap is "keep playing" - resume the same board.
      tapAction('start');
      return;
    }
    if (v.over) {
      // Round ended: a tap starts a fresh puzzle - "try again" if not verified,
      // "play again" for fun if already verified.
      tapAction('start');
      return;
    }
    if (!v.started) {
      // The start screen is up: a tap anywhere begins the round.
      tapAction('start');
      return;
    }
    if (!v.active) return;
    pressing = true;
    startX = p.x;
    startY = p.y;
    startClock = k.time();
    moved = 0;
  });

  k.onMouseMove(() => {
    if (!pressing) return;
    const v = getView();
    if (!v.started || !v.active) return;
    const L = layout();
    const cs = pieceCells(v.active).map(([c]) => c);
    const left = Math.min(...cs);
    const w = Math.max(...cs) - left + 1;
    const tc = Math.floor((k.mousePos().x - L.ox) / L.cell);
    // Step the piece ONE column toward the integer target under the finger (and
    // stop when it is there - dragTargetLeft is integer, so no oscillation). One
    // step per move event keeps the keyboard's input phase, so the trace replays
    // identically.
    const target = dragTargetLeft(tc, w, v.cfg.cols);
    if (left < target) {
      tapAction('right');
      moved++;
    } else if (left > target) {
      tapAction('left');
      moved++;
    }
  });

  k.onMouseRelease(() => {
    if (!pressing) return;
    pressing = false;
    const v = getView();
    if (v.over || !v.started || !v.active) return;
    const p = k.mousePos();
    const L = layout();
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (dy > L.cell * 1.1 && dy > Math.abs(dx)) {
      // Swipe DOWN -> hard drop. A horizontal move release does NOT drop, so you
      // can move + rotate freely and only drop when you mean to.
      tapAction('hardDrop');
    } else if (moved === 0 && k.time() - startClock < 0.3 && Math.abs(dx) < L.cell * 0.5 && Math.abs(dy) < L.cell * 0.5) {
      // A clean tap -> rotate.
      tapAction('rotateCW');
    }
  });

  // Cursor: the board is a grabbable surface, so show grab / grabbing while a
  // piece is in play, a pointer over the tappable overlays, default otherwise.
  k.onDraw(() => {
    const v = getView();
    let cursor = 'default';
    if (v.verifiedPause || v.over || !v.started) cursor = 'pointer';
    else if (pressing) cursor = 'grabbing';
    else if (v.active) cursor = 'grab';
    k.setCursor(cursor);
  });
}
