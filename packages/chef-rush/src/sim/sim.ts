// The Chef Rush simulation - the high-trust gate logic, run inside the engine's
// fixed update (api.onTick) on BOTH ends. It reads input + randomness ONLY through
// the preset api (so live and replay agree) and owns the pass/fail decision.
//
// Loop: an order ticket lists the ingredients a dish needs. Ingredients appear at
// three stations - the cutting board (chop), the pot (stir) and the pan (flip).
// The player performs each station's gesture on the ingredients the order needs,
// leaving wrong ingredients and rotten ones alone. Complete `passScore` orders to
// verify.
//
// Anti-cheat rules implemented here (the captcha-game design standard):
//   F2  every gate-affecting value (order recipe, item type/station/rotten,
//       timing) comes from the server seed via api.rand*.
//   R1  a gesture landing < REACTION_TICKS after an item appeared is superhuman
//       and does not count (the item is consumed, but it does not fill).
//   R2  cooking a WRONG (off-recipe) or ROTTEN item costs a life; distractor
//       density + a per-item window provide bad-target density + time pressure, so
//       an indiscriminate "gesture everything" bot loses before it serves enough.
//   U6  a gesture only registers after the stroke sweeps >= MIN_GESTURE_SPAN AND
//       classifies as the station's motion (chop/stir/flip), so the captured motor
//       input is a rich, shaped path the input-signature judge scores - not a tap.
//   U2  `verified` latches when ordersServed >= passScore; result/pass read only that.

import { isHumanReaction } from '@caputchin/engine-kit';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';
import { DISTRACTOR_CHANCE_MAX, RAMP_TICKS, REACTION_TICKS, SPAWN_INTERVAL_MIN_TICKS } from './constants';
import { cheb, classifyGesture, nearestStation } from './gestures';
import {
  INGREDIENT_COUNT,
  STATION_COUNT,
  stationOf,
  type ChefConfig,
  type Fx,
  type Item,
  type Order,
  type SimView,
  type Stroke,
} from './types';

export interface ChefSim {
  /** Advance one fixed tick. Wire to `api.onTick`. */
  tick(): void;
  /** Current render state (live only). */
  view(): SimView;
}

/** Ingredient type indices grouped by their station (computed once). */
const STATION_TYPES: number[][] = Array.from({ length: STATION_COUNT }, () => []);
for (let t = 0; t < INGREDIENT_COUNT; t++) STATION_TYPES[stationOf(t)]!.push(t);

/** Linear ramp from `from` to `to` over RAMP_TICKS, then held at `to`. */
function ramp(tick: number, from: number, to: number): number {
  if (tick >= RAMP_TICKS) return to;
  return from + ((to - from) * tick) / RAMP_TICKS;
}

export function createChefSim(api: ExcaliburGameApi, cfg: ChefConfig): ChefSim {
  let items: Item[] = [];
  let nextId = 0;
  let nextOrderId = 0;
  let spawnTimer = 0;
  let ordersServed = 0;
  let lives = cfg.lives;
  let verified = false;
  let over = false;
  let fx: Fx[] = [];

  const stroke: Stroke = {
    active: false,
    anchorX: 0,
    anchorY: 0,
    lastX: 0,
    lastY: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    pathLen: 0,
  };

  function newOrder(): Order {
    // Distinct ingredients (partial Fisher-Yates over the type indices), so a dish
    // reads as several different preps rather than the same one repeated.
    const pool = Array.from({ length: INGREDIENT_COUNT }, (_, i) => i);
    const required: number[] = [];
    const n = Math.min(cfg.recipeSize, INGREDIENT_COUNT);
    for (let i = 0; i < n; i++) {
      const j = i + api.randi(INGREDIENT_COUNT - i);
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
      required.push(pool[i]!);
    }
    return { id: nextOrderId++, required, filled: required.map(() => 0) };
  }
  let order: Order = newOrder();

  /** Ingredient types the order still needs (the ones to cook right now). */
  const unfilledTypes = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < order.required.length; i++) {
      if (order.filled[i] === 0) out.push(order.required[i]!);
    }
    return out;
  };

  const itemAtStation = (station: number): Item | undefined =>
    items.find((it) => it.station === station && it.done === 0);

  /** A matching gesture landed on this item. Apply the gate rules. */
  function cook(it: Item, t: number): void {
    it.done = 1;
    if (it.rotten === 1) {
      lives = Math.max(0, lives - 1);
      fx.push({ kind: 'mistake', station: it.station });
      return;
    }
    // First unfilled requirement matching this type.
    let req = -1;
    for (let i = 0; i < order.required.length; i++) {
      if (order.required[i] === it.type && order.filled[i] === 0) {
        req = i;
        break;
      }
    }
    if (req < 0) {
      // Off-recipe (or already have enough) -> a mistake (R2).
      lives = Math.max(0, lives - 1);
      fx.push({ kind: 'mistake', station: it.station });
      return;
    }
    // Needed + fresh: R1 gate. A too-fast gesture consumes the item but does not fill.
    if (!isHumanReaction(it.appearTick, t, REACTION_TICKS)) return;
    order.filled[req] = 1;
    fx.push({ kind: 'cook', station: it.station });
    if (order.filled.every((f) => f === 1)) {
      ordersServed += 1;
      fx.push({ kind: 'serve', station: it.station });
      if (!verified && ordersServed >= cfg.passScore) verified = true;
      else order = newOrder();
    }
  }

  /** Resolve a completed stroke: classify it, aim it at a station, and (if the
   *  gesture matches that station and an item is there) cook it. Wrong gesture for
   *  a station, or an empty station, is a harmless no-op. */
  function resolveGesture(t: number): void {
    const kind = classifyGesture(stroke);
    if (kind < 0) return; // not a gesture (tap / sideways)
    const station = nearestStation(stroke.anchorX, stroke.anchorY);
    if (station < 0) return; // not aimed at a station
    if (kind !== station) return; // wrong motion for this station
    const it = itemAtStation(station);
    if (!it) return;
    cook(it, t);
  }

  function spawn(t: number): void {
    const interval = ramp(t, cfg.spawnIntervalTicks, SPAWN_INTERVAL_MIN_TICKS);
    spawnTimer += 1;
    if (spawnTimer < interval) return;
    spawnTimer = 0;

    const free: number[] = [];
    for (let s = 0; s < STATION_COUNT; s++) if (!itemAtStation(s)) free.push(s);
    if (free.length === 0) return;

    const distractorChance = ramp(t, cfg.distractorChance, DISTRACTOR_CHANCE_MAX);
    const needed = unfilledTypes();
    // Needed ingredients whose station is currently free (so the order stays solvable).
    const needable = needed.filter((type) => free.includes(stationOf(type)));

    let station: number;
    let type: number;
    let rotten: 0 | 1 = 0;

    if (needable.length > 0 && !api.chance(distractorChance)) {
      type = needable[api.randi(needable.length)]!;
      station = stationOf(type);
    } else {
      station = free[api.randi(free.length)]!;
      const kinds = STATION_TYPES[station]!;
      if (api.chance(0.5)) {
        // Rotten distractor - any ingredient of this station, must not be cooked.
        type = kinds[api.randi(kinds.length)]!;
        rotten = 1;
      } else {
        // Wrong-ingredient distractor: a station ingredient not currently needed.
        const wrong = kinds.filter((k) => !needed.includes(k));
        type = wrong.length > 0 ? wrong[api.randi(wrong.length)]! : kinds[api.randi(kinds.length)]!;
      }
    }

    items.push({
      id: nextId++,
      station,
      type,
      rotten,
      appearTick: t,
      expireTick: t + cfg.itemWindowTicks,
      done: 0,
    });
  }

  function expire(t: number): void {
    const needed = new Set(unfilledTypes());
    for (const it of items) {
      if (it.done === 0 && t >= it.expireTick) {
        it.done = 1;
        // A fresh, still-needed ingredient that you let spoil costs a life. A
        // distractor (wrong or rotten) leaving is correct play, no penalty.
        if (it.rotten === 0 && needed.has(it.type)) {
          lives = Math.max(0, lives - 1);
          fx.push({ kind: 'mistake', station: it.station });
        } else {
          fx.push({ kind: 'expire', station: it.station });
        }
      }
    }
    if (items.some((it) => it.done === 1)) items = items.filter((it) => it.done === 0);
  }

  return {
    tick(): void {
      if (over) return;
      const t = api.tick;
      fx = [];

      for (const ev of api.pointer.events) {
        if (ev.kind === 0) {
          stroke.active = true;
          stroke.anchorX = ev.x;
          stroke.anchorY = ev.y;
          stroke.lastX = ev.x;
          stroke.lastY = ev.y;
          stroke.minX = ev.x;
          stroke.maxX = ev.x;
          stroke.minY = ev.y;
          stroke.maxY = ev.y;
          stroke.pathLen = 0;
        } else if (ev.kind === 1) {
          if (stroke.active) {
            stroke.pathLen += cheb(stroke.lastX, stroke.lastY, ev.x, ev.y);
            stroke.lastX = ev.x;
            stroke.lastY = ev.y;
            if (ev.x < stroke.minX) stroke.minX = ev.x;
            if (ev.x > stroke.maxX) stroke.maxX = ev.x;
            if (ev.y < stroke.minY) stroke.minY = ev.y;
            if (ev.y > stroke.maxY) stroke.maxY = ev.y;
          }
        } else {
          if (stroke.active) {
            stroke.pathLen += cheb(stroke.lastX, stroke.lastY, ev.x, ev.y);
            stroke.lastX = ev.x;
            stroke.lastY = ev.y;
            if (ev.x < stroke.minX) stroke.minX = ev.x;
            if (ev.x > stroke.maxX) stroke.maxX = ev.x;
            if (ev.y < stroke.minY) stroke.minY = ev.y;
            if (ev.y > stroke.maxY) stroke.maxY = ev.y;
            resolveGesture(t);
          }
          stroke.active = false;
        }
      }

      spawn(t);
      expire(t);

      if (lives <= 0) {
        over = true;
        api.setScore(ordersServed);
        api.gameOver();
        return;
      }
      if (verified) {
        over = true;
        api.setScore(ordersServed);
        api.pass();
        api.gameOver();
        return;
      }
      if (t >= cfg.timeBudgetTicks) {
        over = true;
        api.setScore(ordersServed);
        api.gameOver();
        return;
      }
      api.setScore(ordersServed);
    },

    view(): SimView {
      return {
        items,
        order,
        ordersServed,
        lives,
        tick: api.tick,
        passScore: cfg.passScore,
        verified,
        over,
        fx,
      };
    },
  };
}
