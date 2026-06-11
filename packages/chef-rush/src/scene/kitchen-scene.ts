// The live kitchen, built from Excalibur Actors with shape Graphics (no 2D-canvas
// blit). The deterministic sim owns the verdict; this scene is the VIEW it drives -
// each tick the sync reads sim.view() and updates Actor positions / graphics /
// visibility / text. Built only when !api.headless (the replay never renders), so
// nothing here touches the verdict. The stations / trash / prep / overlay-button
// geometry the verdict uses lives in src/scene/collision-geom.ts (Excalibur colliders),
// matching the shapes drawn here.

import * as ex from 'excalibur';
import type { Engine } from 'excalibur';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';
import {
  ITEM_R,
  PREP,
  STATIONS,
  STATION_R,
  TRASH,
  TRASH_R,
  WORLD_H,
  WORLD_W,
  OVERLAY_CARD_W,
  OVERLAY_CARD_H_WAITING,
  OVERLAY_CARD_H_END,
  overlayButtonRect,
} from '../sim/constants.js';
import {
  DROP_TRASH,
  GAME_LOST,
  GAME_PLAYING,
  GAME_WAITING,
  GAME_WON,
  INGREDIENTS,
  PHASE_STATION,
  stationOf,
  type SimView,
} from '../sim/types.js';
import type { ChefSim } from '../sim/sim.js';
import { resolveTheme, type Theme } from './theme.js';
import { font, gestureGlyph, heart, roundedRect } from './shapes.js';
import { buildStrings } from '../strings.js';
import { createGameAudio } from '../audio.js';
import { SPRITES } from '../art/sprites.generated.js';
import { spriteSkinKey } from '../skin.js';

const GESTURE_LABEL = ['CHOP', 'STIR', 'FLIP'];
const col = (hex: string): ex.Color => ex.Color.fromHex(hex);

/** Build the live scene + wire the per-tick view sync. Call only when !api.headless. */
export function buildKitchenScene(engine: Engine, api: ExcaliburGameApi, sim: ChefSim): void {
  const t: Theme = resolveTheme(api.ctx?.skin ?? null);
  const strings = buildStrings(api.ctx?.locale ?? null);
  const soundOn = (api.ctx?.config as { sound?: unknown } | null)?.sound !== false;
  const audio = createGameAudio(soundOn);
  const scene = engine.currentScene;
  const add = (a: ex.Actor): ex.Actor => {
    scene.add(a);
    return a;
  };
  const actor = (x: number, y: number, z: number, g: ex.Graphic): ex.Actor => {
    const a = new ex.Actor({ pos: ex.vec(x, y), z });
    a.graphics.use(g);
    return add(a);
  };
  const posOf = (where: number): ex.Vector =>
    where >= 0 ? ex.vec(STATIONS[where]!.x, STATIONS[where]!.y) : where === DROP_TRASH ? ex.vec(TRASH.x, TRASH.y) : ex.vec(PREP.x, PREP.y);
  // A burst of particles thrown by the engine's physics (initial velocity + a gravity
  // acceleration the MotionSystem integrates each fixed tick), faded out then removed.
  // Cosmetic + live only, so it never touches the verdict.
  const spawnBurst = (p: ex.Vector, color: ex.Color): void => {
    for (let i = 0; i < 6; i++) {
      const dot = new ex.Actor({ pos: p.clone(), z: 36 });
      dot.graphics.use(new ex.Circle({ radius: 5, color }));
      dot.vel = ex.vec((Math.random() - 0.5) * 220, -130 - Math.random() * 120);
      dot.acc = ex.vec(0, 560);
      scene.add(dot);
      dot.actions.fade(0, 720).die();
    }
  };

  // --- ingredient sprites (food stays the CC0 PNGs; skin art_<key> may override) ----
  const skinMap = (api.ctx?.skin ?? {}) as Record<string, unknown>;
  const itemSprites: Record<string, ex.Sprite> = {};
  const ticketSprites: Record<string, ex.Sprite> = {};
  for (const [key, uri] of Object.entries(SPRITES)) {
    const ov = skinMap[spriteSkinKey(key)];
    const src = new ex.ImageSource(typeof ov === 'string' && ov ? ov : uri);
    void src.load().catch(() => undefined);
    itemSprites[key] = new ex.Sprite({ image: src, destSize: { width: ITEM_R * 2, height: ITEM_R * 2 } });
    ticketSprites[key] = new ex.Sprite({ image: src, destSize: { width: 40, height: 40 } });
  }

  // --- static furniture -----------------------------------------------------------
  actor(WORLD_W / 2, 125, 0, new ex.Rectangle({ width: WORLD_W, height: 250, color: col(t.wall) }));
  actor(WORLD_W / 2, 425, 0, new ex.Rectangle({ width: WORLD_W, height: 350, color: col(t.counter) }));
  // prep plate
  actor(PREP.x, PREP.y, 5, roundedRect(ITEM_R * 2.8, ITEM_R * 2.1, 16, { color: col('#43392f'), strokeColor: col('#5a4d40'), lineWidth: 2 }));

  // stations: cookware shape + a label, + a drop-highlight ring toggled while dragging
  const stationHi: ex.Actor[] = [];
  for (let s = 0; s < STATIONS.length; s++) {
    const c = STATIONS[s]!;
    if (s === 0) {
      // cutting board: wood slab + grain lines
      actor(c.x, c.y, 10, roundedRect(158, 102, 16, { color: col(t.board), strokeColor: col(t.boardEdge), lineWidth: 4 }));
      for (let g = -1; g <= 1; g++) actor(c.x, c.y + g * 24, 11, new ex.Rectangle({ width: 134, height: 3, color: col(t.boardEdge) }));
    } else if (s === 1) {
      // pot: a deep body with an open elliptical rim showing broth, two side handles
      actor(c.x - 80, c.y - 2, 10, roundedRect(26, 16, 5, { color: col(t.metalDark) }));
      actor(c.x + 80, c.y - 2, 10, roundedRect(26, 16, 5, { color: col(t.metalDark) }));
      actor(c.x, c.y + 16, 11, roundedRect(132, 98, 18, { color: col(t.steel), strokeColor: col(t.metalDark), lineWidth: 3 }));
      const rim = actor(c.x, c.y - 30, 12, new ex.Circle({ radius: 66, color: col(t.metal), strokeColor: col(t.metalDark), lineWidth: 3 }));
      rim.scale = ex.vec(1, 0.42);
      const broth = actor(c.x, c.y - 30, 13, new ex.Circle({ radius: 53, color: col('#caa46a') }));
      broth.scale = ex.vec(1, 0.4);
    } else {
      // pan: long handle, dark round body, lighter cooking surface
      actor(c.x + 90, c.y, 10, roundedRect(78, 17, 7, { color: col('#5a3f29') }));
      actor(c.x, c.y, 11, new ex.Circle({ radius: 63, color: col(t.pan), strokeColor: col(t.metalDark), lineWidth: 5 }));
      actor(c.x, c.y, 12, new ex.Circle({ radius: 48, color: col('#45454e') }));
    }
    // label pill + glyph + text
    const labelBg = roundedRect(134, 38, 18, { color: col('#1c120a') });
    labelBg.opacity = 0.64;
    const lbl = add(new ex.Actor({ pos: ex.vec(c.x, c.y + ITEM_R * 1.8), z: 14 }));
    lbl.graphics.use(labelBg);
    actor(c.x - 40, c.y + ITEM_R * 1.8, 15, gestureGlyph(s, 14, col('#fff8ec')));
    const lblTxt = add(new ex.Actor({ pos: ex.vec(c.x - 16, c.y + ITEM_R * 1.8), z: 15, anchor: ex.vec(0, 0.5) }));
    lblTxt.graphics.use(new ex.Text({ text: GESTURE_LABEL[s]!, font: font(21, col('#fff8ec')) }));
    const hi = add(new ex.Actor({ pos: ex.vec(c.x, c.y), z: 9 }));
    hi.graphics.use(new ex.Circle({ radius: STATION_R - 14, color: ex.Color.Transparent, strokeColor: col(t.accent), lineWidth: 4 }));
    hi.graphics.isVisible = false;
    stationHi.push(hi);
  }

  // trash: a tapered bin + a lid, each its own Actor (predictable placement)
  actor(TRASH.x, TRASH.y, 10, new ex.Polygon({ points: [ex.vec(-29, -27), ex.vec(29, -27), ex.vec(22, 31), ex.vec(-22, 31)], color: col(t.trash), strokeColor: col(t.metalDark), lineWidth: 2 }));
  actor(TRASH.x, TRASH.y - 33, 11, roundedRect(66, 12, 4, { color: col(t.metalDark) }));
  const trashHi = add(new ex.Actor({ pos: ex.vec(TRASH.x, TRASH.y), z: 9 }));
  trashHi.graphics.use(new ex.Circle({ radius: TRASH_R - 10, color: ex.Color.Transparent, strokeColor: col(t.danger), lineWidth: 4 }));
  trashHi.graphics.isVisible = false;

  // --- the current ingredient + its overlays --------------------------------------
  const itemA = add(new ex.Actor({ pos: ex.vec(PREP.x, PREP.y), z: 30 }));
  const spoiledA = add(new ex.Actor({ pos: ex.vec(PREP.x, PREP.y), z: 31 }));
  spoiledA.graphics.use(spoiledGraphic());
  const promptA = add(new ex.Actor({ pos: ex.vec(PREP.x, PREP.y), z: 34 }));
  // Spoil-timer ring: built from many fixed arc-segments (not one changing polygon, which
  // drifts as its bounds change). Each segment is a symmetric-bounds Polygon at a FIXED
  // offset from the item centre, so it never moves; draining just toggles segments off.
  const TIMER_N = 40;
  const timerR = ITEM_R + 12;
  const timerTh = 7;
  const timerSegs: ex.Actor[] = [];
  const segOff: Array<[number, number]> = [];
  const segOk: ex.Polygon[] = [];
  const segLow: ex.Polygon[] = [];
  for (let i = 0; i < TIMER_N; i++) {
    const a0 = -Math.PI / 2 + (i / TIMER_N) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((i + 1.06) / TIMER_N) * Math.PI * 2; // 6% overlap so segments touch
    const inner = timerR - timerTh / 2;
    const outer = timerR + timerTh / 2;
    const abs: ex.Vector[] = [];
    for (let j = 0; j <= 2; j++) {
      const a = a0 + (a1 - a0) * (j / 2);
      abs.push(ex.vec(Math.cos(a) * outer, Math.sin(a) * outer));
    }
    for (let j = 2; j >= 0; j--) {
      const a = a0 + (a1 - a0) * (j / 2);
      abs.push(ex.vec(Math.cos(a) * inner, Math.sin(a) * inner));
    }
    let mnx = Infinity;
    let mny = Infinity;
    let mxx = -Infinity;
    let mxy = -Infinity;
    for (const p of abs) {
      mnx = Math.min(mnx, p.x);
      mxx = Math.max(mxx, p.x);
      mny = Math.min(mny, p.y);
      mxy = Math.max(mxy, p.y);
    }
    const ocx = (mnx + mxx) / 2;
    const ocy = (mny + mxy) / 2;
    segOff.push([ocx, ocy]);
    const rel = abs.map((p) => ex.vec(p.x - ocx, p.y - ocy)); // symmetric bounds -> centres on actor pos
    segOk.push(new ex.Polygon({ points: rel, color: col('#fff7ec') }));
    segLow.push(new ex.Polygon({ points: rel, color: col(t.danger) }));
    const sg = add(new ex.Actor({ pos: ex.vec(PREP.x, PREP.y), z: 33 }));
    sg.graphics.use(segOk[i]!);
    sg.graphics.isVisible = false;
    timerSegs.push(sg);
  }

  // Pointer trail (fruit-slash style): a pool of fading, tapering line segments along the
  // recent pointer path while pressed. Each segment is its own Actor centred on the
  // segment midpoint - a Line's bounds centre cleanly, so the trail does not drift.
  const TRAIL_N = 18;
  const trailBuf: Array<{ x: number; y: number }> = [];
  const trailSegs: ex.Actor[] = [];
  for (let i = 0; i < TRAIL_N; i++) {
    const sg = add(new ex.Actor({ pos: ex.vec(0, 0), z: 38 }));
    sg.graphics.isVisible = false;
    trailSegs.push(sg);
  }

  // --- recipe ticket (rows rebuilt when the order changes) ------------------------
  const ticketX = WORLD_W / 2;
  const ticketTop = 12;
  const ticketCard = add(new ex.Actor({ pos: ex.vec(ticketX, ticketTop + 90), z: 20 }));
  const ticketTitle = add(new ex.Actor({ pos: ex.vec(ticketX, ticketTop + 24), z: 21 }));
  ticketTitle.graphics.use(new ex.Text({ text: 'ORDER', font: font(24, col(t.ink)) }));
  let rowActors: ex.Actor[] = [];
  let lastOrderId = -1;

  // --- HUD: served + hearts -------------------------------------------------------
  const servedA = add(new ex.Actor({ pos: ex.vec(28, 38), z: 40, anchor: ex.vec(0, 0.5) }));
  servedA.graphics.use(new ex.Text({ text: '', font: font(30, col('#fff8ec')) }));
  const hearts: ex.Actor[] = [];
  for (let i = 0; i < 6; i++) {
    const h = add(new ex.Actor({ pos: ex.vec(WORLD_W - 28 - i * 30, 34), z: 40 }));
    h.graphics.use(heart(12, col(t.life)));
    h.graphics.isVisible = false;
    hearts.push(h);
  }

  // --- instruction (while playing) ------------------------------------------------
  const instr = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, WORLD_H - 34), z: 40 }));
  instr.graphics.use(new ex.Text({ text: strings.t('instruction'), font: font(20, col('#fff8ec'), false), maxWidth: WORLD_W - 80 }));
  instr.graphics.isVisible = false;

  // --- overlay (start / won / lost) -----------------------------------------------
  const dim = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, WORLD_H / 2), z: 90 }));
  dim.graphics.use(new ex.Rectangle({ width: WORLD_W, height: WORLD_H, color: col('#120c07') }));
  dim.graphics.opacity = 0.72;
  const card = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, WORLD_H / 2), z: 91 }));
  const titleA = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 92 }));
  const bodyA = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 92 }));
  const badgeA = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 92 }));
  const badgeMarkA = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 93 }));
  const btn = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 92 }));
  const btnLabel = add(new ex.Actor({ pos: ex.vec(WORLD_W / 2, 0), z: 93 }));
  const legend: ex.Actor[] = [];
  for (let k = 0; k < 3; k++) {
    const lx = WORLD_W / 2 + (k - 1) * 132;
    const ly = (WORLD_H - OVERLAY_CARD_H_WAITING) / 2 + 198;
    legend.push(actor(lx, ly, 92, gestureGlyph(k, 22, col(t.ink))));
    legend.push(actor(lx, ly + 40, 92, new ex.Text({ text: GESTURE_LABEL[k]!, font: font(20, col(t.ink)) })));
  }
  const overlayActors = [dim, card, titleA, bodyA, badgeA, badgeMarkA, btn, btnLabel, ...legend];

  function setText(a: ex.Actor, text: string, f: ex.Font, maxWidth?: number): void {
    a.graphics.use(new ex.Text({ text, font: f, maxWidth }));
  }

  // --- per-tick sync (runs after sim.tick, since registered after it in game.ts) ---
  let pulse = 0;
  let terminalAnnounced = false;
  api.onTick(() => {
    const v = sim.view();
    pulse += 0.08;

    // fx -> audio + announce (cosmetic; verdict already decided in the sim)
    for (const f of v.fx) {
      const p = posOf(f.where);
      if (f.kind === 'serve') {
        spawnBurst(p, col(t.accent));
        api.announce(strings.t('served'));
        audio.play('verified');
      } else if (f.kind === 'mistake') {
        spawnBurst(p, col(t.danger));
        api.announce(strings.t('mistake'));
        audio.play('spoiled');
      } else if (f.kind === 'cook') {
        spawnBurst(p, col(t.accent));
        audio.play('serve');
      } else if (f.kind === 'trash') {
        spawnBurst(p, col(t.metalDark));
      } else if (f.kind === 'spoil') {
        spawnBurst(p, col(t.danger));
        api.announce(strings.t('missed'));
      }
    }
    if ((v.gamePhase === GAME_WON || v.gamePhase === GAME_LOST) && !terminalAnnounced) {
      terminalAnnounced = true;
      api.announce(strings.t(v.gamePhase === GAME_WON ? 'wonTitle' : 'lostTitle'));
    } else if (v.gamePhase === GAME_PLAYING && terminalAnnounced) terminalAnnounced = false;

    syncTicket(v);
    syncItem(v);
    syncHud(v);
    syncStations(v);
    syncTrail(v);
    syncOverlay(v);
    instr.graphics.isVisible = v.gamePhase === GAME_PLAYING;
  });

  function syncTrail(v: SimView): void {
    const p = api.pointer;
    if (p.isDown && v.gamePhase === GAME_PLAYING) {
      trailBuf.push({ x: p.x, y: p.y });
      while (trailBuf.length > TRAIL_N + 1) trailBuf.shift();
    } else if (trailBuf.length) {
      trailBuf.length = 0;
    }
    const segs = trailBuf.length - 1;
    for (let i = 0; i < TRAIL_N; i++) {
      const sg = trailSegs[i]!;
      if (i >= segs) {
        sg.graphics.isVisible = false;
        continue;
      }
      const a = trailBuf[i]!;
      const b = trailBuf[i + 1]!;
      const k = (i + 1) / trailBuf.length; // 0 at the tail, ~1 at the pointer head
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      sg.pos = ex.vec(mx, my);
      sg.graphics.use(
        new ex.Line({ start: ex.vec(a.x - mx, a.y - my), end: ex.vec(b.x - mx, b.y - my), color: col('#fff7ec'), thickness: 2 + k * 11 }),
      );
      sg.graphics.opacity = k * 0.85;
      sg.graphics.isVisible = true;
    }
  }

  function syncStations(v: SimView): void {
    for (const hi of stationHi) hi.graphics.isVisible = v.dragging;
    trashHi.graphics.isVisible = v.dragging;
  }

  function syncItem(v: SimView): void {
    const it = v.item;
    const show = it !== null && v.gamePhase === GAME_PLAYING;
    itemA.graphics.isVisible = show;
    spoiledA.graphics.isVisible = show && it!.rotten === 1;
    promptA.graphics.isVisible = show && it!.phase === PHASE_STATION;
    if (!show || !it) {
      for (const sg of timerSegs) sg.graphics.isVisible = false;
      return;
    }
    let cx: number = PREP.x;
    let cy: number = PREP.y;
    if (v.dragging) {
      cx = api.pointer.x;
      cy = api.pointer.y;
    } else if (it.phase === PHASE_STATION) {
      cx = STATIONS[it.station]!.x;
      cy = STATIONS[it.station]!.y - 6;
    }
    itemA.graphics.use(itemSprites[INGREDIENTS[it.type]!.key]!);
    itemA.pos = ex.vec(cx, cy);
    spoiledA.pos = ex.vec(cx, cy);
    promptA.pos = ex.vec(cx, cy);
    // spoil timer: fixed arc-segments draining clockwise from the top; reddens when low
    const total = it.expireTick - it.appearTick;
    const frac = total > 0 ? Math.max(0, Math.min(1, (it.expireTick - v.tick) / total)) : 0;
    const low = frac < 0.3;
    const lit = Math.round(frac * TIMER_N);
    for (let i = 0; i < TIMER_N; i++) {
      const sg = timerSegs[i]!;
      sg.graphics.isVisible = i < lit;
      sg.graphics.use(low ? segLow[i]! : segOk[i]!);
      sg.pos = ex.vec(cx + segOff[i]![0], cy + segOff[i]![1]);
    }
    if (it.phase === PHASE_STATION) {
      const k = 1 + 0.12 * Math.sin(pulse * 1.6);
      promptA.graphics.use(gestureGlyph(it.station, ITEM_R * 0.62 * k, ex.Color.White));
    }
  }

  function syncHud(v: SimView): void {
    setText(servedA, `${strings.t('servedLabel')} ${v.dishesServed}/${v.passScore}`, font(30, col('#fff8ec')));
    const slots = Math.max(3, v.lives);
    for (let i = 0; i < hearts.length; i++) {
      const h = hearts[i]!;
      h.graphics.isVisible = i < slots;
      h.graphics.use(heart(12, col(i < v.lives ? t.life : t.lifeOff)));
    }
  }

  function syncTicket(v: SimView): void {
    const order = v.order;
    if (!order || order.id === lastOrderId) {
      // still update the checks for the live order (3 actors per row: sprite, text, check)
      if (order) {
        for (let i = 0; i < order.required.length; i++) {
          const check = rowActors[i * 3 + 2];
          if (check) check.graphics.isVisible = order.filled[i] === 1;
        }
      }
      return;
    }
    lastOrderId = order.id;
    for (const a of rowActors) scene.remove(a);
    rowActors = [];
    const n = order.required.length;
    const rowH = 46;
    const cardW = 300;
    const cardH = 52 + n * rowH;
    ticketCard.pos = ex.vec(ticketX, ticketTop + cardH / 2);
    ticketCard.graphics.use(roundedRect(cardW, cardH, 14, { color: col(t.ticket) }));
    ticketTitle.pos = ex.vec(ticketX, ticketTop + 24);
    for (let i = 0; i < n; i++) {
      const type = order.required[i]!;
      const ry = ticketTop + 52 + i * rowH + rowH / 2;
      const sp = add(new ex.Actor({ pos: ex.vec(ticketX - 104, ry), z: 21 }));
      sp.graphics.use(ticketSprites[INGREDIENTS[type]!.key]!);
      const txt = add(new ex.Actor({ pos: ex.vec(ticketX - 72, ry), z: 21, anchor: ex.vec(0, 0.5) }));
      txt.graphics.use(new ex.Text({ text: `→  ${GESTURE_LABEL[stationOf(type)]!}`, font: font(23, col(t.ink)) }));
      const check = add(new ex.Actor({ pos: ex.vec(ticketX + 116, ry), z: 21 }));
      check.graphics.use(new ex.Text({ text: '✓', font: font(28, col(t.accent)) }));
      check.graphics.isVisible = order.filled[i] === 1;
      rowActors.push(sp, txt, check);
    }
  }

  function syncOverlay(v: SimView): void {
    const overlay = v.gamePhase !== GAME_PLAYING;
    for (const a of overlayActors) a.graphics.isVisible = overlay;
    const showLegend = v.gamePhase === GAME_WAITING;
    for (const a of legend) a.graphics.isVisible = showLegend;
    if (!overlay) return;
    const waiting = v.gamePhase === GAME_WAITING;
    const chh = waiting ? OVERLAY_CARD_H_WAITING : OVERLAY_CARD_H_END;
    const cy = (WORLD_H - chh) / 2;
    card.pos = ex.vec(WORLD_W / 2, cy + chh / 2);
    card.graphics.use(roundedRect(OVERLAY_CARD_W, chh, 20, { color: col(t.ticket) }));

    let title: string;
    let body: string;
    let button: string;
    let accent: ex.Color;
    badgeA.graphics.isVisible = !waiting;
    badgeMarkA.graphics.isVisible = !waiting;
    if (v.gamePhase === GAME_WON) {
      title = strings.t('wonTitle');
      body = strings.t('wonBody');
      button = strings.t('keepPlaying');
      accent = col(t.accent);
      badgeA.pos = ex.vec(WORLD_W / 2, cy + 60);
      badgeA.graphics.use(new ex.Circle({ radius: 34, color: accent }));
      badgeMarkA.pos = ex.vec(WORLD_W / 2, cy + 60);
      badgeMarkA.graphics.use(new ex.Text({ text: '✓', font: font(44, ex.Color.White) }));
    } else if (v.gamePhase === GAME_LOST) {
      title = strings.t('lostTitle');
      body = strings.t('lostBody');
      button = strings.t('tryAgain');
      accent = col(t.danger);
      badgeA.pos = ex.vec(WORLD_W / 2, cy + 60);
      badgeA.graphics.use(new ex.Circle({ radius: 34, color: accent }));
      badgeMarkA.pos = ex.vec(WORLD_W / 2, cy + 60);
      badgeMarkA.graphics.use(new ex.Text({ text: '✕', font: font(42, ex.Color.White) }));
    } else {
      title = 'Chef Rush';
      body = strings.t('instruction');
      button = strings.t('startPrompt');
      accent = col(t.accent);
    }
    const titleY = waiting ? cy + 60 : cy + 122;
    titleA.pos = ex.vec(WORLD_W / 2, titleY);
    setText(titleA, title, font(40, col(t.ink)));
    bodyA.pos = ex.vec(WORLD_W / 2, titleY + 42);
    setText(bodyA, body, font(21, col('#5a4636'), false), OVERLAY_CARD_W - 104);
    const b = overlayButtonRect(v.gamePhase);
    btn.pos = ex.vec(b.x + b.w / 2, b.y + b.h / 2);
    btn.graphics.use(roundedRect(b.w, b.h, 30, { color: accent }));
    btnLabel.pos = ex.vec(b.x + b.w / 2, b.y + b.h / 2 + 1);
    setText(btnLabel, button, font(28, ex.Color.White));
  }
}

/** The spoiled overlay: mould blotches + a red "do not cook" badge over the food. */
function spoiledGraphic(): ex.GraphicsGroup {
  const r = ITEM_R;
  const members: Array<{ graphic: ex.Graphic; offset: ex.Vector }> = [];
  const tint = new ex.Circle({ radius: r * 0.95, color: ex.Color.fromRGB(88, 106, 44, 0.62) });
  members.push({ graphic: tint, offset: ex.vec(-r * 0.95, -r * 0.95) });
  const mold: ReadonlyArray<readonly [number, number, number]> = [
    [-0.3, -0.18, 0.27],
    [0.32, 0.12, 0.21],
    [0.02, 0.36, 0.19],
    [-0.36, 0.3, 0.15],
    [0.27, -0.34, 0.14],
  ];
  for (const [mx, my, ms] of mold) {
    const c = new ex.Circle({ radius: ms * r, color: ex.Color.fromRGB(48, 62, 26, 0.85) });
    members.push({ graphic: c, offset: ex.vec(mx * r - ms * r, my * r - ms * r) });
  }
  // a red "do not cook" dot in the corner (circles compose cleanly in a group)
  const bx = r * 0.72;
  const by = -r * 0.72;
  members.push({ graphic: new ex.Circle({ radius: r * 0.3, color: ex.Color.fromHex('#e8463c'), strokeColor: ex.Color.White, lineWidth: 3 }), offset: ex.vec(bx - r * 0.3, by - r * 0.3) });
  return new ex.GraphicsGroup({ members, useAnchor: false });
}
