// Live renderer (browser only). Draws the whole kitchen each frame through an
// ex.Canvas graphic on a ScreenElement actor - rendered by the GraphicsSystem (the
// reliable path; immediate-mode postdraw does not composite). The draw callback
// reads the sim's view() each frame and paints with the 2D canvas context: a tiled
// wall + wooden counter, three stations (cutting board, steel pot, frying pan) drawn
// procedurally, the ingredients as CC0 illustrated sprites (src/art, Glitch / Tiny
// Speck, public domain), a paper order ticket, gesture trails, and the HUD. Render is
// cosmetic and never reaches the sim, so nothing here affects the verdict.
//
// All excalibur VALUE access (and every browser-only `new Image()`) stays inside
// setupRender, which only runs when !api.headless - render.ts is in the headless
// import graph (via game.ts) so module top level must touch neither.

import * as ex from 'excalibur';
import type { Engine } from 'excalibur';
import type { ExcaliburGameApi, GameContext } from '@caputchin/preset-excalibur';
import { ITEM_R, STATIONS, WORLD_H, WORLD_W } from './sim/constants';
import { INGREDIENTS, type Item, type SimView } from './sim/types';
import type { ChefSim } from './sim/sim';
import { buildStrings } from './strings';
import { createGameAudio } from './audio';
import { SPRITES } from './art/sprites.generated';

type Ctx = CanvasRenderingContext2D;

interface Palette {
  wall: string;
  wallTile: string;
  counter: string;
  counterDark: string;
  board: string;
  boardEdge: string;
  ticket: string;
  ink: string;
  good: string;
  life: string;
  lifeOff: string;
}

const SKIN_DEFAULTS: Record<string, string> = {
  wall: '#efd9bd',
  counter: '#aa7a48',
  board: '#e0bd84',
  board_edge: '#a07a44',
  ticket: '#fbf4e4',
  ink: '#3a2c1c',
  accent_color: '#56b84e',
  life_color: '#e8615a',
};

function paletteFrom(skin: GameContext['skin']): Palette {
  const m = (skin ?? {}) as Record<string, unknown>;
  const get = (k: string, d: string): string => {
    const v = m[k];
    return typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v) ? v : d;
  };
  return {
    wall: get('wall', SKIN_DEFAULTS.wall!),
    wallTile: '#e3c9a6',
    counter: get('counter', SKIN_DEFAULTS.counter!),
    counterDark: '#7d5532',
    board: get('board', SKIN_DEFAULTS.board!),
    boardEdge: get('board_edge', SKIN_DEFAULTS.board_edge!),
    ticket: get('ticket', SKIN_DEFAULTS.ticket!),
    ink: get('ink', SKIN_DEFAULTS.ink!),
    good: get('accent_color', SKIN_DEFAULTS.accent_color!),
    life: get('life_color', SKIN_DEFAULTS.life_color!),
    lifeOff: '#6a5240',
  };
}

const GESTURE_LABEL = ['CHOP', 'STIR', 'FLIP'];

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wire the live renderer. Call only when !api.headless. */
export function setupRender(engine: Engine, api: ExcaliburGameApi, sim: ChefSim): void {
  const strings = buildStrings(api.ctx?.locale ?? null);
  const pal = paletteFrom(api.ctx?.skin ?? null);
  const soundOn = (api.ctx?.config as { sound?: unknown } | null)?.sound !== false;
  const audio = createGameAudio(soundOn);

  // Preload the ingredient sprite atlas (browser only). Data-URIs, so no network.
  const imgs: Record<string, HTMLImageElement> = {};
  for (const [key, uri] of Object.entries(SPRITES)) {
    const im = new Image();
    im.src = uri;
    imgs[key] = im;
  }

  const trail: Array<{ x: number; y: number }> = [];
  const flash: Array<{ kind: string; life: number } | null> = STATIONS.map(() => null);
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
      } else if (f.kind === 'cook') {
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
      while (trail.length > 16) trail.shift();
    } else if (trail.length) trail.length = 0;
  });

  const canvas = new ex.Canvas({ width: WORLD_W, height: WORLD_H, cache: false, draw: (ctx) => drawScene(ctx as Ctx) });
  const screen = new ex.ScreenElement({ x: 0, y: 0, width: WORLD_W, height: WORLD_H, anchor: ex.Vector.Zero });
  screen.graphics.use(canvas);
  engine.add(screen);

  function drawScene(ctx: Ctx): void {
    const v = sim.view();
    for (const f of v.fx) flash[f.station] = { kind: f.kind, life: 1 };

    drawKitchen(ctx);
    for (let s = 0; s < STATIONS.length; s++) drawStation(ctx, s);
    for (const it of v.items) drawItem(ctx, it, v.tick);
    for (let s = 0; s < STATIONS.length; s++) drawGestureHint(ctx, s);
    drawTicket(ctx, v);
    drawTrail(ctx);
    drawHud(ctx, v);

    ctx.fillStyle = 'rgba(255,250,240,0.92)';
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(strings.t('instruction'), WORLD_W / 2, WORLD_H - 22);

    for (let i = 0; i < flash.length; i++) {
      const fl = flash[i];
      if (fl) {
        fl.life -= 0.1;
        if (fl.life <= 0) flash[i] = null;
      }
    }
  }

  function drawKitchen(ctx: Ctx): void {
    // back wall - warm tiled
    const wall = ctx.createLinearGradient(0, 0, 0, 330);
    wall.addColorStop(0, pal.wall);
    wall.addColorStop(1, pal.wallTile);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, WORLD_W, 330);
    ctx.strokeStyle = 'rgba(150,120,86,0.25)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 330);
      ctx.stroke();
    }
    for (let y = 40; y < 330; y += 56) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }
    // counter - wood, with a lip and grain
    const wood = ctx.createLinearGradient(0, 318, 0, WORLD_H);
    wood.addColorStop(0, pal.counter);
    wood.addColorStop(1, pal.counterDark);
    ctx.fillStyle = wood;
    ctx.fillRect(0, 318, WORLD_W, WORLD_H - 318);
    ctx.fillStyle = 'rgba(255,232,196,0.35)';
    ctx.fillRect(0, 318, WORLD_W, 8); // front lip highlight
    ctx.strokeStyle = 'rgba(90,60,30,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const gy = 350 + i * 42;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(WORLD_W * 0.33, gy + 7, WORLD_W * 0.66, gy - 7, WORLD_W, gy + 3);
      ctx.stroke();
    }
  }

  // --- Stations (procedural cookware), each centred on STATIONS[s] -----------------

  function drawStation(ctx: Ctx, s: number): void {
    const c = STATIONS[s]!;
    // soft contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + ITEM_R * 0.95, ITEM_R * 1.35, ITEM_R * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s === 0) drawBoard(ctx, c.x, c.y);
    else if (s === 1) drawPot(ctx, c.x, c.y);
    else drawPan(ctx, c.x, c.y);
  }

  function drawBoard(ctx: Ctx, cx: number, cy: number): void {
    const w = ITEM_R * 3;
    const h = ITEM_R * 1.8;
    ctx.save();
    rounded(ctx, cx - w / 2, cy - h / 2 + 12, w, h, 16);
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, pal.board);
    g.addColorStop(1, pal.boardEdge);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,86,44,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const gy = cy - h / 2 + 22 + i * 22;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, gy);
      ctx.lineTo(cx + w / 2, gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPot(ctx: Ctx, cx: number, cy: number): void {
    const r = ITEM_R * 1.32;
    // handles
    ctx.fillStyle = '#6b7178';
    ctx.fillRect(cx - r - 16, cy - 6, 18, 12);
    ctx.fillRect(cx + r - 2, cy - 6, 18, 12);
    // body
    const body = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    body.addColorStop(0, '#9aa0a8');
    body.addColorStop(0.5, '#cfd4da');
    body.addColorStop(1, '#878d95');
    ctx.fillStyle = body;
    rounded(ctx, cx - r, cy - r * 0.5, r * 2, r * 1.5, 14);
    ctx.fill();
    // rim
    ctx.fillStyle = '#e6e9ee';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.5, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // interior (broth)
    ctx.fillStyle = '#caa46a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.5, r * 0.82, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPan(ctx: Ctx, cx: number, cy: number): void {
    const r = ITEM_R * 1.28;
    // handle (to the right)
    ctx.fillStyle = '#5a3f29';
    ctx.fillRect(cx + r * 0.8, cy - 9, r * 1.1, 18);
    ctx.fillStyle = '#3a281a';
    ctx.fillRect(cx + r * 1.6, cy - 9, 14, 18);
    // pan body
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#4a4a52');
    g.addColorStop(1, '#26262c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b5b64';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2);
    ctx.stroke();
    // sheen
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.3, r * 0.4, r * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGestureHint(ctx: Ctx, s: number): void {
    const c = STATIONS[s]!;
    const y = c.y + ITEM_R * 1.55;
    ctx.fillStyle = 'rgba(28,18,10,0.55)';
    rounded(ctx, c.x - 40, y, 80, 26, 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,236,0.92)';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GESTURE_LABEL[s]!, c.x, y + 13);
  }

  // --- Items (ingredient sprites) --------------------------------------------------

  function drawSprite(ctx: Ctx, type: number, cx: number, cy: number, r: number, alpha = 1): void {
    const img = imgs[INGREDIENTS[type]!.key];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  function drawItem(ctx: Ctx, it: Item, tick: number): void {
    const c = STATIONS[it.station]!;
    // the ingredient sits a touch above the station centre
    const cy = c.y - 6;
    drawSprite(ctx, it.type, c.x, cy, ITEM_R);
    if (it.rotten === 1) drawSpoiled(ctx, c.x, cy, ITEM_R);

    // countdown ring
    const total = it.expireTick - it.appearTick;
    const frac = total > 0 ? Math.max(0, it.expireTick - tick) / total : 0;
    ctx.strokeStyle = frac < 0.3 ? '#e8615a' : 'rgba(255,247,236,0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c.x, cy, ITEM_R + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();

    const fl = flash[it.station];
    if (fl) {
      const col = fl.kind === 'mistake' ? '226,59,50' : fl.kind === 'cook' || fl.kind === 'serve' ? '86,184,78' : '255,247,236';
      ctx.strokeStyle = `rgba(${col},${Math.max(0, fl.life)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c.x, cy, ITEM_R + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawSpoiled(ctx: Ctx, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(74,92,46,0.5)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(40,55,28,0.6)';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // a little fly
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.8, cy - r * 0.8, r * 0.08, r * 0.05, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Order ticket ---------------------------------------------------------------

  function drawTicket(ctx: Ctx, v: SimView): void {
    const order = v.order;
    if (!order) return;
    const n = order.required.length;
    const iconW = 56;
    const gap = 10;
    const cardW = Math.max(220, n * iconW + (n + 1) * gap);
    const x = (WORLD_W - cardW) / 2;
    const y = 14;
    const h = 112;
    ctx.fillStyle = '#d24b3e'; // pin
    ctx.beginPath();
    ctx.arc(x + cardW / 2, y - 1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = pal.ticket;
    rounded(ctx, x, y, cardW, h, 12);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.ink;
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ORDER', x + cardW / 2, y + 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 32);
    ctx.lineTo(x + cardW - 16, y + 32);
    ctx.stroke();
    const row = n * iconW + (n - 1) * gap;
    let ix = x + (cardW - row) / 2 + iconW / 2;
    for (let i = 0; i < n; i++) {
      const filled = order.filled[i] === 1;
      drawSprite(ctx, order.required[i]!, ix, y + 72, 24, filled ? 0.28 : 1);
      if (filled) {
        ctx.strokeStyle = pal.good;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ix - 12, y + 72);
        ctx.lineTo(ix - 3, y + 82);
        ctx.lineTo(ix + 14, y + 58);
        ctx.stroke();
      }
      ix += iconW + gap;
    }
  }

  function drawTrail(ctx: Ctx): void {
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]!;
      const b = trail[i]!;
      ctx.strokeStyle = `rgba(255,255,255,${(i / trail.length) * 0.85})`;
      ctx.lineWidth = 9 * (i / trail.length) + 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawHud(ctx: Ctx, v: SimView): void {
    ctx.fillStyle = 'rgba(28,18,10,0.5)';
    rounded(ctx, 16, 16, 168, 38, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,236,0.96)';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Served ${v.ordersServed}/${v.passScore}`, 28, 36);
    const slots = Math.max(3, v.lives);
    for (let i = 0; i < slots; i++) drawHeart(ctx, WORLD_W - 28 - i * 32, 34, 12, i < v.lives ? pal.life : pal.lifeOff);
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
