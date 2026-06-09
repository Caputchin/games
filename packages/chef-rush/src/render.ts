// Live renderer (browser only). Immediate-mode draw in the engine's postdraw,
// reading the sim's view() each frame. Coordinates are the fixed world space
// (0..WORLD_W, 0..WORLD_H); the live mount centres the camera so world == the
// letterboxed resolution, so drawing at sim coords lands correctly at any
// container size. Flat, procedural art - no asset files. The palette comes from
// the resolved skin (ctx.skin) with built-in fallbacks. Render is cosmetic and
// never reaches the sim, so nothing here affects the verdict.
//
// IMPORTANT: all excalibur VALUE access (Color/Vector/Font/Text/draw) stays INSIDE
// functions - never at module top level. setupRender is browser-only and never
// runs headless, but this module is still imported by the headless/red-team graph,
// so a top-level `ex.Color.fromHex(...)` would execute (and break) there. The
// preset follows the same no-top-level-excalibur discipline.

import * as ex from 'excalibur';
import type { Engine, ExcaliburGraphicsContext } from 'excalibur';
import type { ExcaliburGameApi, GameContext } from '@caputchin/preset-excalibur';
import { DIR_DOWN, DIR_LEFT, DIR_UP, STATIONS, STATION_R, WORLD_H, WORLD_W } from './sim/constants';
import { GOOD, type Prompt, type SimView } from './sim/types';
import type { ChefSim } from './sim/sim';
import { buildStrings } from './strings';
import { createGameAudio } from './audio';

type Color = ex.Color;
type Vector = ex.Vector;

interface Palette {
  bg: Color;
  counter: Color;
  station: Color;
  stationRing: Color;
  good: Color;
  spoiled: Color;
  arrow: Color;
  accent: Color;
  life: Color;
  // Fixed (non-skin) cues.
  scoreOff: Color;
  lifeOff: Color;
  timer: Color;
  trail: Color;
  miss: Color;
}

const SKIN_DEFAULTS: Record<string, string> = {
  background: '#1b1410',
  counter: '#2a211a',
  station: '#3a2f25',
  station_ring: '#5a4836',
  good_color: '#f2a93b',
  spoiled_color: '#d24b3e',
  mark_color: '#fff7ec',
  accent_color: '#7fd86f',
  life_color: '#e8615a',
};

function buildPalette(skin: GameContext['skin']): Palette {
  const map = (skin ?? {}) as Record<string, unknown>;
  const pick = (skinKey: string): Color => {
    const v = map[skinKey];
    const hex = typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v) ? v : SKIN_DEFAULTS[skinKey]!;
    try {
      return ex.Color.fromHex(hex);
    } catch {
      return ex.Color.fromHex(SKIN_DEFAULTS[skinKey]!);
    }
  };
  return {
    bg: pick('background'),
    counter: pick('counter'),
    station: pick('station'),
    stationRing: pick('station_ring'),
    good: pick('good_color'),
    spoiled: pick('spoiled_color'),
    arrow: pick('mark_color'),
    accent: pick('accent_color'),
    life: pick('life_color'),
    scoreOff: ex.Color.fromHex('#3a3128'),
    lifeOff: ex.Color.fromHex('#3a2b2a'),
    timer: ex.Color.fromHex('#ffd98a'),
    trail: ex.Color.fromHex('#9fe8ff'),
    miss: ex.Color.fromHex('#8a7a66'),
  };
}

function dirVec(dir: number): Vector {
  if (dir === DIR_UP) return new ex.Vector(0, -1);
  if (dir === DIR_DOWN) return new ex.Vector(0, 1);
  if (dir === DIR_LEFT) return new ex.Vector(-1, 0);
  return new ex.Vector(1, 0); // DIR_RIGHT
}

/** Wire the live renderer. Call only when !api.headless. */
export function setupRender(engine: Engine, api: ExcaliburGameApi, sim: ChefSim): void {
  const strings = buildStrings(api.ctx?.locale ?? null);
  const pal = buildPalette(api.ctx?.skin ?? null);
  const soundOn = (api.ctx?.config as { sound?: unknown } | null)?.sound !== false;
  const audio = createGameAudio(soundOn);
  const instr = new ex.Text({
    text: strings.t('instruction'),
    font: new ex.Font({ size: 26, family: 'system-ui, sans-serif', color: ex.Color.fromHex('#d8cbb8') }),
  });
  api.announce(strings.t('ariaIntro'));

  const trail: Array<{ x: number; y: number }> = [];
  const TRAIL_MAX = 16;
  const flash: Array<{ color: Color; life: number } | null> = STATIONS.map(() => null);
  let terminalAnnounced = false;

  api.onTick(() => {
    const p = api.pointer;
    if (p.isDown) {
      trail.push({ x: p.x, y: p.y });
      while (trail.length > TRAIL_MAX) trail.shift();
    } else if (trail.length > 0) {
      trail.length = 0;
    }
    const v = sim.view();
    for (const f of v.fx) {
      if (f.kind === 'serve') {
        api.announce(strings.t('served'));
        audio.play('serve');
      } else if (f.kind === 'spoiled') {
        api.announce(strings.t('spoiledHit'));
        audio.play('spoiled');
      } else if (f.kind === 'miss') {
        api.announce(strings.t('missed'));
        audio.play('miss');
      }
    }
    if (v.over && !terminalAnnounced) {
      terminalAnnounced = true;
      api.announce(strings.t(v.verified ? 'verified' : 'failed'));
      if (v.verified) audio.play('verified');
    }
  });

  engine.on('postdraw', () => {
    const ctx = engine.graphicsContext;
    const v = sim.view();

    for (const f of v.fx) {
      const color = f.kind === 'serve' ? pal.accent : f.kind === 'spoiled' ? pal.spoiled : pal.miss;
      flash[f.station] = { color, life: 1 };
    }

    ctx.drawRectangle(new ex.Vector(0, 0), WORLD_W, WORLD_H, pal.bg);
    ctx.drawRectangle(new ex.Vector(0, 320), WORLD_W, 220, pal.counter);
    for (let i = 0; i < STATIONS.length; i++) drawStation(ctx, pal, i, flash[i] ?? null);
    for (const prompt of v.prompts) drawPrompt(ctx, pal, prompt, v.tick);
    drawTrail(ctx, pal, trail);
    drawHud(ctx, pal, v);
    instr.draw(ctx, 40, WORLD_H - 56);

    for (let i = 0; i < flash.length; i++) {
      const fl = flash[i];
      if (fl) {
        fl.life -= 0.12;
        if (fl.life <= 0) flash[i] = null;
      }
    }
  });
}

function drawStation(
  ctx: ExcaliburGraphicsContext,
  pal: Palette,
  i: number,
  fl: { color: Color; life: number } | null,
): void {
  const s = STATIONS[i]!;
  const pos = new ex.Vector(s.x, s.y);
  ctx.drawCircle(pos, STATION_R, pal.station, pal.stationRing, 4);
  if (fl) {
    const c = fl.color.clone();
    c.a = Math.max(0, Math.min(1, fl.life)) * 0.6;
    ctx.drawCircle(pos, STATION_R, c);
  }
}

function drawPrompt(ctx: ExcaliburGraphicsContext, pal: Palette, p: Prompt, tick: number): void {
  const s = STATIONS[p.station]!;
  const center = new ex.Vector(s.x, s.y);
  ctx.drawCircle(center, STATION_R - 18, p.kind === GOOD ? pal.good : pal.spoiled);

  if (p.kind === GOOD) {
    const d = dirVec(p.dir);
    const len = STATION_R - 28;
    const tip = center.add(d.scale(len));
    const tail = center.sub(d.scale(len));
    ctx.drawLine(tail, tip, pal.arrow, 8);
    const perp = new ex.Vector(-d.y, d.x);
    const head = 22;
    ctx.drawLine(tip, tip.sub(d.scale(head)).add(perp.scale(head)), pal.arrow, 8);
    ctx.drawLine(tip, tip.sub(d.scale(head)).sub(perp.scale(head)), pal.arrow, 8);
  } else {
    const r = STATION_R - 34;
    ctx.drawLine(center.add(new ex.Vector(-r, -r)), center.add(new ex.Vector(r, r)), pal.arrow, 9);
    ctx.drawLine(center.add(new ex.Vector(-r, r)), center.add(new ex.Vector(r, -r)), pal.arrow, 9);
  }

  const total = p.expireTick - p.appearTick;
  const left = Math.max(0, p.expireTick - tick);
  const frac = total > 0 ? left / total : 0;
  const barW = STATION_R * 2;
  ctx.drawRectangle(new ex.Vector(s.x - STATION_R, s.y + STATION_R + 12), barW, 10, pal.scoreOff);
  ctx.drawRectangle(new ex.Vector(s.x - STATION_R, s.y + STATION_R + 12), barW * frac, 10, pal.timer);
}

function drawTrail(ctx: ExcaliburGraphicsContext, pal: Palette, trail: Array<{ x: number; y: number }>): void {
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    const c = pal.trail.clone();
    c.a = (i / trail.length) * 0.8;
    ctx.drawLine(new ex.Vector(a.x, a.y), new ex.Vector(b.x, b.y), c, 6);
  }
}

function drawHud(ctx: ExcaliburGraphicsContext, pal: Palette, v: SimView): void {
  const pipR = 12;
  const gap = 34;
  const startX = 40;
  for (let i = 0; i < v.passScore; i++) {
    ctx.drawCircle(new ex.Vector(startX + i * gap, 40), pipR, i < v.score ? pal.accent : pal.scoreOff);
  }
  const lifeStart = WORLD_W - 40;
  const lifeSlots = Math.max(3, v.lives);
  for (let i = 0; i < lifeSlots; i++) {
    ctx.drawCircle(new ex.Vector(lifeStart - i * gap, 40), pipR, i < v.lives ? pal.life : pal.lifeOff);
  }
}
