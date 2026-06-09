// The Chef Rush simulation - the high-trust gate logic, run inside the engine's
// fixed update (api.onTick) on BOTH ends. It reads input + randomness ONLY through
// the preset api (so live and replay agree) and owns the pass/fail decision.
//
// Loop: an order ticket lists the ingredients a dish needs. Ingredients appear on
// the cutting board; the player chops (swipes across) the ones the order needs and
// leaves the wrong / rotten ones. Complete `passScore` orders to verify.
//
// Anti-cheat rules implemented here (the captcha-game design standard):
//   F2  every gate-affecting value (order recipe, ingredient type/rotten/slot,
//       timing) comes from the server seed via api.rand*.
//   R1  a chop landing < REACTION_TICKS after an ingredient appeared is superhuman
//       and does not count (consumed, no fill).
//   R2  chopping a WRONG or ROTTEN ingredient costs a life; distractor density +
//       a per-ingredient window provide bad-target density + time pressure, so an
//       indiscriminate "chop everything" bot loses before it serves enough orders.
//   U6  a chop only registers after the stroke sweeps >= MIN_CHOP_SPAN, so the
//       captured motor input is a rich path (drag) the input-signature judge scores.
//   U2  `verified` latches when ordersServed >= passScore; result/pass read only that.

import { isHumanReaction } from '@caputchin/engine-kit';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';
import {
  DISTRACTOR_CHANCE_MAX,
  HIT_PAD,
  INGREDIENT_R,
  MIN_CHOP_SPAN,
  RAMP_TICKS,
  REACTION_TICKS,
  SLOTS,
  SLOT_COUNT,
  SPAWN_INTERVAL_MIN_TICKS,
} from './constants';
import { span, swipeHitsCircle } from './gestures';
import { INGREDIENT_COUNT, type ChefConfig, type Fx, type Ingredient, type Order, type SimView } from './types';

export interface ChefSim {
  /** Advance one fixed tick. Wire to `api.onTick`. */
  tick(): void;
  /** Current render state (live only). */
  view(): SimView;
}

/** Linear ramp from `from` to `to` over RAMP_TICKS, then held at `to`. */
function ramp(tick: number, from: number, to: number): number {
  if (tick >= RAMP_TICKS) return to;
  return from + ((to - from) * tick) / RAMP_TICKS;
}

const CHOP_R2 = (INGREDIENT_R + HIT_PAD) * (INGREDIENT_R + HIT_PAD);

export function createChefSim(api: ExcaliburGameApi, cfg: ChefConfig): ChefSim {
  let ingredients: Ingredient[] = [];
  let nextId = 0;
  let nextOrderId = 0;
  let spawnTimer = 0;
  let ordersServed = 0;
  let lives = cfg.lives;
  let verified = false;
  let over = false;
  let fx: Fx[] = [];

  const stroke = { active: false, consumed: false, anchorX: 0, anchorY: 0, lastX: 0, lastY: 0, hasLast: false };

  function newOrder(): Order {
    const required: number[] = [];
    for (let i = 0; i < cfg.recipeSize; i++) required.push(api.randi(INGREDIENT_COUNT));
    return { id: nextOrderId++, required, filled: required.map(() => 0) };
  }
  let order: Order = newOrder();

  /** Indices of order requirements still unfilled (their ingredient types are
   *  what the player should be chopping right now). */
  const unfilledTypes = (): Set<number> => {
    const s = new Set<number>();
    for (let i = 0; i < order.required.length; i++) if (order.filled[i] === 0) s.add(order.required[i]!);
    return s;
  };

  const ingredientAtSlot = (slot: number): Ingredient | undefined =>
    ingredients.find((g) => g.slot === slot && g.done === 0);

  function chop(g: Ingredient, t: number): void {
    g.done = 1;
    if (g.rotten === 1) {
      lives = Math.max(0, lives - 1);
      fx.push({ kind: 'mistake', slot: g.slot });
      return;
    }
    // First unfilled requirement matching this type.
    let req = -1;
    for (let i = 0; i < order.required.length; i++) {
      if (order.required[i] === g.type && order.filled[i] === 0) {
        req = i;
        break;
      }
    }
    if (req < 0) {
      // Not needed (wrong ingredient, or already have enough) -> mistake.
      lives = Math.max(0, lives - 1);
      fx.push({ kind: 'mistake', slot: g.slot });
      return;
    }
    // Needed + fresh: R1 gate. A too-fast chop is consumed but does not fill.
    if (!isHumanReaction(g.appearTick, t, REACTION_TICKS)) return;
    order.filled[req] = 1;
    fx.push({ kind: 'chop', slot: g.slot });
    if (order.filled.every((f) => f === 1)) {
      ordersServed += 1;
      fx.push({ kind: 'serve', slot: g.slot });
      if (!verified && ordersServed >= cfg.passScore) verified = true;
      else order = newOrder();
    }
  }

  /** Apply one swipe segment, chopping the first ingredient it crosses once the
   *  stroke has swept a genuine span (U6). One chop per stroke. */
  function chopSegment(ax: number, ay: number, bx: number, by: number, t: number): void {
    if (stroke.consumed) return;
    if (span(stroke.anchorX, stroke.anchorY, bx, by) < MIN_CHOP_SPAN) return;
    for (const g of ingredients) {
      if (g.done === 1) continue;
      const s = SLOTS[g.slot]!;
      if (!swipeHitsCircle(ax, ay, bx, by, s.x, s.y, CHOP_R2)) continue;
      stroke.consumed = true;
      chop(g, t);
      return;
    }
  }

  function spawn(t: number): void {
    const interval = ramp(t, cfg.spawnIntervalTicks, SPAWN_INTERVAL_MIN_TICKS);
    spawnTimer += 1;
    if (spawnTimer < interval) return;
    spawnTimer = 0;
    const free: number[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) if (!ingredientAtSlot(i)) free.push(i);
    if (free.length === 0) return;
    const slot = free[api.randi(free.length)]!;

    const distractorChance = ramp(t, cfg.distractorChance, DISTRACTOR_CHANCE_MAX);
    const needed = [...unfilledTypes()];
    let type: number;
    let rotten: 0 | 1 = 0;
    if (needed.length > 0 && !api.chance(distractorChance)) {
      // A needed ingredient (so the order stays fulfillable), fresh.
      type = needed[api.randi(needed.length)]!;
    } else if (api.chance(0.5)) {
      // Rotten distractor (any type) - must not be chopped.
      type = api.randi(INGREDIENT_COUNT);
      rotten = 1;
    } else {
      // Wrong-ingredient distractor: a type NOT currently needed, fresh.
      const wrong: number[] = [];
      for (let i = 0; i < INGREDIENT_COUNT; i++) if (!needed.includes(i)) wrong.push(i);
      type = wrong.length > 0 ? wrong[api.randi(wrong.length)]! : api.randi(INGREDIENT_COUNT);
    }
    ingredients.push({
      id: nextId++,
      slot,
      type,
      rotten,
      appearTick: t,
      expireTick: t + cfg.ingredientWindowTicks,
      done: 0,
    });
  }

  function expire(t: number): void {
    const needed = unfilledTypes();
    for (const g of ingredients) {
      if (g.done === 0 && t >= g.expireTick) {
        g.done = 1;
        // A fresh, still-needed ingredient that slipped by costs a life (you let a
        // needed ingredient go). A distractor leaving is fine (correctly ignored).
        if (g.rotten === 0 && needed.has(g.type)) {
          lives = Math.max(0, lives - 1);
          fx.push({ kind: 'mistake', slot: g.slot });
        } else {
          fx.push({ kind: 'expire', slot: g.slot });
        }
      }
    }
    if (ingredients.some((g) => g.done === 1)) ingredients = ingredients.filter((g) => g.done === 0);
  }

  return {
    tick(): void {
      if (over) return;
      const t = api.tick;
      fx = [];

      for (const ev of api.pointer.events) {
        if (ev.kind === 0) {
          stroke.active = true;
          stroke.consumed = false;
          stroke.anchorX = ev.x;
          stroke.anchorY = ev.y;
          stroke.lastX = ev.x;
          stroke.lastY = ev.y;
          stroke.hasLast = true;
        } else if (ev.kind === 1) {
          if (stroke.active && stroke.hasLast) chopSegment(stroke.lastX, stroke.lastY, ev.x, ev.y, t);
          stroke.lastX = ev.x;
          stroke.lastY = ev.y;
          stroke.hasLast = true;
        } else {
          stroke.active = false;
          stroke.hasLast = false;
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
        ingredients,
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
