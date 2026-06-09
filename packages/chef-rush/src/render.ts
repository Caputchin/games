// Live renderer (browser only). Draws the whole kitchen each frame through an
// ex.Canvas graphic on a ScreenElement actor - rendered by the GraphicsSystem (the
// reliable path; immediate-mode postdraw does not composite). The draw callback
// reads the sim's view() each frame and paints with the 2D canvas context: a wood
// cutting board, a paper order ticket, the ingredients (rich flat food art), the
// chop trail, and the HUD. Flat, procedural art - no asset files. Render is cosmetic
// and never reaches the sim, so nothing here affects the verdict.
//
// All excalibur VALUE access stays inside setupRender (never module top level), per
// the no-top-level-excalibur discipline the preset follows.

import * as ex from 'excalibur';
import type { Engine } from 'excalibur';
import type { ExcaliburGameApi, GameContext } from '@caputchin/preset-excalibur';
import { INGREDIENT_R, SLOTS, WORLD_H, WORLD_W } from './sim/constants';
import { type Ingredient, type SimView } from './sim/types';
import type { ChefSim } from './sim/sim';
import { buildStrings } from './strings';
import { createGameAudio } from './audio';

type Ctx = CanvasRenderingContext2D;

interface Palette {
  bg: string;
  bgDark: string;
  board: string;
  boardDark: string;
  boardEdge: string;
  ticket: string;
  ink: string;
  good: string;
  life: string;
  lifeOff: string;
}

const SKIN_DEFAULTS: Record<string, string> = {
  background: '#2c2016',
  board: '#d9b378',
  board_edge: '#9c7740',
  ticket: '#fbf4e4',
  ink: '#3a2c1c',
  accent_color: '#5fbf57',
  life_color: '#e8615a',
};

function paletteFrom(skin: GameContext['skin']): Palette {
  const m = (skin ?? {}) as Record<string, unknown>;
  const get = (k: string, d: string): string => {
    const v = m[k];
    return typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v) ? v : d;
  };
  return {
    bg: get('background', SKIN_DEFAULTS.background!),
    bgDark: '#1c130c',
    board: get('board', SKIN_DEFAULTS.board!),
    boardDark: '#c29a5e',
    boardEdge: get('board_edge', SKIN_DEFAULTS.board_edge!),
    ticket: get('ticket', SKIN_DEFAULTS.ticket!),
    ink: get('ink', SKIN_DEFAULTS.ink!),
    good: get('accent_color', SKIN_DEFAULTS.accent_color!),
    life: get('life_color', SKIN_DEFAULTS.life_color!),
    lifeOff: '#5a4636',
  };
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A round body with a top-left radial highlight - the base for tomato/onion. */
function orb(ctx: Ctx, r: number, light: string, mid: string, dark: string): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.4, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw an ingredient icon centred at (cx, cy), radius r. Rich flat art. */
function drawFood(ctx: Ctx, type: number, cx: number, cy: number, r: number, rotten: boolean): void {
  ctx.save();
  ctx.translate(cx, cy);
  switch (type) {
    case 0: { // tomato
      orb(ctx, r * 0.82, rotten ? '#8a7d52' : '#ff6b5e', rotten ? '#6f6442' : '#e23b32', rotten ? '#4a4530' : '#a82820');
      ctx.fillStyle = rotten ? '#566a3a' : '#4ea84e';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.55);
        ctx.quadraticCurveTo(r * 0.16, -r * 0.78, 0, -r * 0.95);
        ctx.quadraticCurveTo(-r * 0.16, -r * 0.78, 0, -r * 0.55);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = rotten ? '#3f4a28' : '#2f7a2f';
      ctx.beginPath();
      ctx.arc(0, -r * 0.62, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 1: { // lettuce
      const outer = rotten ? '#4a5038' : '#3f9a35';
      const inner = rotten ? '#6b7350' : '#8fe06a';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.42, r * 0.5, a, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 0.7);
      g.addColorStop(0, inner);
      g.addColorStop(1, rotten ? '#566a3a' : '#62c24a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rotten ? '#3f4a28' : '#3f9a35';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        ctx.stroke();
      }
      break;
    }
    case 2: { // onion
      orb(ctx, r * 0.78, rotten ? '#8a8060' : '#e7d9ee', rotten ? '#6f6748' : '#c9a9da', rotten ? '#4a4530' : '#9b6fb0');
      ctx.strokeStyle = rotten ? '#3f4a28' : '#9b6fb0';
      ctx.lineWidth = 2.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.22, -r * 0.7);
        ctx.quadraticCurveTo(i * r * 0.32, 0, i * r * 0.22, r * 0.7);
        ctx.stroke();
      }
      ctx.strokeStyle = rotten ? '#566a3a' : '#7bbf5a';
      ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.12, -r * 0.78);
        ctx.lineTo(i * r * 0.2, -r * 1.05);
        ctx.stroke();
      }
      break;
    }
    case 3: { // mushroom
      ctx.fillStyle = rotten ? '#5a5848' : '#efe6d3';
      rounded(ctx, -r * 0.22, -r * 0.05, r * 0.44, r * 0.85, r * 0.16);
      ctx.fill();
      const g = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, -r * 0.1, r * 0.85);
      g.addColorStop(0, rotten ? '#7a6f4a' : '#c98a52');
      g.addColorStop(1, rotten ? '#4a4530' : '#9a5f2f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.05, r * 0.85, r * 0.62, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,245,225,0.7)';
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.25, r * 0.1, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 0.15, r * 0.07, 0, Math.PI * 2);
      ctx.arc(r * 0.05, -r * 0.35, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 4: { // carrot
      ctx.save();
      ctx.rotate(0.18);
      const g = ctx.createLinearGradient(-r * 0.4, 0, r * 0.4, 0);
      g.addColorStop(0, rotten ? '#7a6f4a' : '#ff9b3d');
      g.addColorStop(1, rotten ? '#4a4530' : '#d86a16');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.55);
      ctx.quadraticCurveTo(0, -r * 0.72, r * 0.42, -r * 0.55);
      ctx.quadraticCurveTo(r * 0.12, r * 0.2, 0, r * 0.95);
      ctx.quadraticCurveTo(-r * 0.12, r * 0.2, -r * 0.42, -r * 0.55);
      ctx.fill();
      ctx.strokeStyle = rotten ? '#3f4a28' : '#c5641a';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const yy = -r * 0.4 + i * r * 0.32;
        ctx.beginPath();
        ctx.moveTo(-r * (0.36 - i * 0.07), yy);
        ctx.lineTo(r * (0.36 - i * 0.07), yy);
        ctx.stroke();
      }
      ctx.fillStyle = rotten ? '#566a3a' : '#4ea84e';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.18, -r * 0.55);
        ctx.quadraticCurveTo(i * r * 0.5, -r * 0.95, i * r * 0.3, -r * 1.15);
        ctx.quadraticCurveTo(i * r * 0.1, -r * 0.8, i * r * 0.18, -r * 0.55);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    default: { // cheese (5)
      const g = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.6);
      g.addColorStop(0, rotten ? '#8a8050' : '#ffe27a');
      g.addColorStop(1, rotten ? '#5a5430' : '#e8b81f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.82, r * 0.5);
      ctx.lineTo(r * 0.82, r * 0.5);
      ctx.lineTo(r * 0.82, -r * 0.15);
      ctx.quadraticCurveTo(0, -r * 0.5, -r * 0.82, r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rotten ? '#6a6038' : '#f6d24a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.82, r * 0.1);
      ctx.quadraticCurveTo(0, -r * 0.5, r * 0.82, -r * 0.15);
      ctx.lineTo(r * 0.82, -r * 0.32);
      ctx.quadraticCurveTo(0, -r * 0.66, -r * 0.82, -r * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rotten ? '#4a4528' : '#d8a015';
      ctx.beginPath();
      ctx.arc(r * 0.28, r * 0.22, r * 0.13, 0, Math.PI * 2);
      ctx.arc(-r * 0.28, r * 0.3, r * 0.09, 0, Math.PI * 2);
      ctx.arc(r * 0.0, r * 0.05, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  if (rotten) {
    ctx.fillStyle = 'rgba(40,55,28,0.55)';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    // a little fly
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(r * 0.7, -r * 0.7, r * 0.08, r * 0.05, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,220,220,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.7, -r * 0.74);
    ctx.lineTo(r * 0.6, -r * 0.85);
    ctx.moveTo(r * 0.74, -r * 0.72);
    ctx.lineTo(r * 0.84, -r * 0.83);
    ctx.stroke();
  }
  ctx.restore();
}

/** Wire the live renderer. Call only when !api.headless. */
export function setupRender(engine: Engine, api: ExcaliburGameApi, sim: ChefSim): void {
  const strings = buildStrings(api.ctx?.locale ?? null);
  const pal = paletteFrom(api.ctx?.skin ?? null);
  const soundOn = (api.ctx?.config as { sound?: unknown } | null)?.sound !== false;
  const audio = createGameAudio(soundOn);

  const trail: Array<{ x: number; y: number }> = [];
  const flash: Array<{ kind: string; life: number } | null> = SLOTS.map(() => null);
  let terminalAnnounced = false;

  api.onTick(() => {
    const v = sim.view();
    for (const f of v.fx) {
      if (f.kind === 'serve') {
        api.announce(strings.t('served'));
        audio.play('verified');
      } else if (f.kind === 'mistake') {
        api.announce(strings.t('mistake'));
        audio.play('spoiled');
      } else if (f.kind === 'chop') {
        audio.play('serve');
      } else if (f.kind === 'expire') {
        api.announce(strings.t('missed'));
      }
    }
    if (v.over && !terminalAnnounced) {
      terminalAnnounced = true;
      api.announce(strings.t(v.verified ? 'verified' : 'failed'));
    }
    const p = api.pointer;
    if (p.isDown) {
      trail.push({ x: p.x, y: p.y });
      while (trail.length > 14) trail.shift();
    } else if (trail.length) trail.length = 0;
  });

  const canvas = new ex.Canvas({ width: WORLD_W, height: WORLD_H, cache: false, draw: (ctx) => drawScene(ctx as Ctx) });
  const screen = new ex.ScreenElement({ x: 0, y: 0, width: WORLD_W, height: WORLD_H, anchor: ex.Vector.Zero });
  screen.graphics.use(canvas);
  engine.add(screen);

  function drawScene(ctx: Ctx): void {
    const v = sim.view();
    for (const f of v.fx) flash[f.slot] = { kind: f.kind, life: 1 };

    // background (warm kitchen, darker toward the edges)
    const bg = ctx.createRadialGradient(WORLD_W / 2, WORLD_H * 0.35, 120, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.75);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(1, pal.bgDark);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    drawBoard(ctx);
    drawTicket(ctx, v);
    for (const g of v.ingredients) drawIngredient(ctx, g, v.tick);
    drawTrail(ctx);
    drawHud(ctx, v);

    ctx.fillStyle = 'rgba(251,244,228,0.9)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(strings.t('instruction'), WORLD_W / 2, WORLD_H - 28);

    for (let i = 0; i < flash.length; i++) {
      const fl = flash[i];
      if (fl) {
        fl.life -= 0.1;
        if (fl.life <= 0) flash[i] = null;
      }
    }
  }

  function drawBoard(ctx: Ctx): void {
    const x = 40;
    const y = 320;
    const w = WORLD_W - 80;
    const h = 215;
    ctx.save();
    rounded(ctx, x, y, w, h, 26);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, pal.board);
    g.addColorStop(1, pal.boardDark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // wood grain
    ctx.strokeStyle = 'rgba(120,86,44,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const gy = y + 18 + i * 30;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.bezierCurveTo(x + w * 0.33, gy + 8, x + w * 0.66, gy - 8, x + w, gy + 3);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = pal.boardEdge;
    ctx.lineWidth = 8;
    rounded(ctx, x, y, w, h, 26);
    ctx.stroke();
  }

  function drawTicket(ctx: Ctx, v: SimView): void {
    const order = v.order;
    if (!order) return;
    const n = order.required.length;
    const iconW = 60;
    const gap = 12;
    const cardW = Math.max(230, n * iconW + (n + 1) * gap);
    const x = (WORLD_W - cardW) / 2;
    const y = 20;
    const h = 120;
    // pin
    ctx.fillStyle = '#d24b3e';
    ctx.beginPath();
    ctx.arc(x + cardW / 2, y - 2, 9, 0, Math.PI * 2);
    ctx.fill();
    // paper
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = pal.ticket;
    rounded(ctx, x, y, cardW, h, 12);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.ink;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ORDER', x + cardW / 2, y + 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 34);
    ctx.lineTo(x + cardW - 18, y + 34);
    ctx.stroke();
    const row = n * iconW + (n - 1) * gap;
    let ix = x + (cardW - row) / 2 + iconW / 2;
    for (let i = 0; i < n; i++) {
      const filled = order.filled[i] === 1;
      ctx.globalAlpha = filled ? 0.3 : 1;
      drawFood(ctx, order.required[i]!, ix, y + 76, 24, false);
      ctx.globalAlpha = 1;
      if (filled) {
        ctx.strokeStyle = pal.good;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ix - 13, y + 76);
        ctx.lineTo(ix - 3, y + 87);
        ctx.lineTo(ix + 15, y + 62);
        ctx.stroke();
      }
      ix += iconW + gap;
    }
  }

  function drawIngredient(ctx: Ctx, g: Ingredient, tick: number): void {
    const s = SLOTS[g.slot]!;
    const fl = flash[g.slot];
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + INGREDIENT_R * 0.78, INGREDIENT_R * 0.85, INGREDIENT_R * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFood(ctx, g.type, s.x, s.y, INGREDIENT_R, g.rotten === 1);
    // countdown ring
    const total = g.expireTick - g.appearTick;
    const frac = total > 0 ? Math.max(0, g.expireTick - tick) / total : 0;
    ctx.strokeStyle = frac < 0.3 ? '#e8615a' : 'rgba(255,247,236,0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(s.x, s.y, INGREDIENT_R + 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    if (fl) {
      const c = fl.kind === 'mistake' ? '226,59,50' : fl.kind === 'serve' ? '95,191,87' : '255,247,236';
      ctx.strokeStyle = `rgba(${c},${Math.max(0, fl.life)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, INGREDIENT_R + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawTrail(ctx: Ctx): void {
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]!;
      const b = trail[i]!;
      ctx.strokeStyle = `rgba(255,255,255,${(i / trail.length) * 0.8})`;
      ctx.lineWidth = 8 * (i / trail.length) + 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawHud(ctx: Ctx, v: SimView): void {
    ctx.fillStyle = 'rgba(251,244,228,0.95)';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Served ${v.ordersServed}/${v.passScore}`, 26, 32);
    const slots = Math.max(3, v.lives);
    for (let i = 0; i < slots; i++) drawHeart(ctx, WORLD_W - 30 - i * 34, 32, 13, i < v.lives ? pal.life : pal.lifeOff);
  }

  function drawHeart(ctx: Ctx, x: number, y: number, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.4, x - r * 0.5, y - r * 1.2, x, y - r * 0.3);
    ctx.bezierCurveTo(x + r * 0.5, y - r * 1.2, x + r * 1.4, y - r * 0.4, x, y + r * 0.9);
    ctx.fill();
  }
}
