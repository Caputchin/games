// The Chef Rush simulation - the high-trust gate logic, run inside the engine's
// fixed update (api.onTick) on BOTH ends. It reads input + randomness ONLY through
// the preset api (so live and replay agree) and owns the pass/fail decision.
//
// Loop: the round waits for a tap to start (no randomness is drawn until then). One
// ingredient then waits on the prep counter at a time. An order ticket maps each
// ingredient a dish needs to its action (chop board, stir pot, flip pan). The player
// drags an on-recipe ingredient to its station and performs that station's gesture to
// cook it, or drags a wrong / rotten ingredient to the trash. Cook every ingredient a
// dish needs to serve it; serve `passScore` dishes to verify.
//
// Lifecycle (start / playing / won / lost) is driven by recorded taps, so the headless
// replay reproduces it: the start tap and any try-again taps are pointer events in the
// trace. On a win the headless replay stops (pass latched); the live game shows a
// success screen and can keep playing. On a loss the live game shows a try-again
// screen that restarts the round (the replay reproduces the retry from the trace).
//
// Anti-cheat rules (the captcha-game design standard):
//   F2  every gate-affecting value (recipe, item type/rotten, timing) comes from the
//       server seed via api.rand*; nothing is drawn before the start tap.
//   R1  a cooking gesture landing < REACTION_TICKS after the item appeared does not
//       count (consumed without filling).
//   R2  cooking a wrong/rotten item, the wrong station, or trashing a needed item all
//       cost a life - an indiscriminate bot drains lives before serving enough.
//   U6  two motor acts per kept item - the drag to the station AND the cooking gesture
//       (which must cut through the station's circle and complete chop/stir/flip) -
//       are rich paths the input-signature judge scores, not taps.
//   U2  `verified` latches when dishesServed >= passScore; result/pass read only that.

import { isHumanReaction } from '@caputchin/engine-kit';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';
import { GESTURE_HIT_R, MIN_DRAG_SPAN, overlayButtonRect, REACTION_TICKS, STATIONS } from './constants';
import { dropTarget, isGestureComplete, onPrepItem, swipeHitsCircle, type Stroke } from './gestures';
import {
  DROP_NONE,
  DROP_TRASH,
  GAME_LOST,
  GAME_PLAYING,
  GAME_WAITING,
  GAME_WON,
  INGREDIENT_COUNT,
  PHASE_COUNTER,
  PHASE_STATION,
  stationOf,
  type ChefConfig,
  type Fx,
  type GamePhase,
  type Item,
  type Order,
  type SimView,
} from './types';

export interface ChefSim {
  /** Advance one fixed tick. Wire to `api.onTick`. */
  tick(): void;
  /** Current render state (live only). */
  view(): SimView;
}

/** The pointer hit-tests the rule core needs, injected so the SAME rules can be
 *  decided two equivalent ways: by Excalibur's Collider geometry in the live/headless
 *  engine (the genuine engine-driven verdict), or by the sqrt-free integer geometry
 *  the offline red-team driver uses. Every region here is an axis-aligned box
 *  (Chebyshev / rect), so a Box collider's `contains` is bit-identical to the integer
 *  test - a parity test guards that. The gesture-shape + gesture-cross stay internal
 *  (they are the custom U6 surface, not a box hit-test). */
export interface SimGeometry {
  /** Did a press at (x, y) land on the prep-counter ingredient? */
  onPrepItem(x: number, y: number): boolean;
  /** Where did a drag end: a station index (0..2), DROP_TRASH, or DROP_NONE? */
  dropTarget(x: number, y: number): number;
  /** Is (x, y) inside the overlay button for this lifecycle phase? */
  inButton(gamePhase: GamePhase, x: number, y: number): boolean;
}

/** The integer-geometry implementation (the offline red-team driver's default). */
export const integerGeometry: SimGeometry = {
  onPrepItem,
  dropTarget,
  inButton(gamePhase, x, y) {
    const b = overlayButtonRect(gamePhase);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  },
};

/** Ticks between one item being resolved and the next sliding in (a visible beat). */
const RESPAWN_TICKS = 14;
/** Squared radius a cooking gesture's path must cut within of its station. */
const HIT_R2 = GESTURE_HIT_R * GESTURE_HIT_R;

/** Stroke + what it is: 0 none (ignored), 1 a drag of the prep item, 2 a cooking
 *  gesture (when an item is placed at a station). `consumed` latches once a gesture
 *  has cooked; `crossedStation` once its path has cut through the station's circle. */
type SimStroke = Stroke & { kind: 0 | 1 | 2; consumed: boolean; crossedStation: boolean };

export function createChefSim(api: ExcaliburGameApi, cfg: ChefConfig, geom: SimGeometry = integerGeometry): ChefSim {
  let current: Item | null = null;
  let nextItemId = 0;
  let nextOrderId = 0;
  let respawn = 0;
  let dishesServed = 0;
  let lives = cfg.lives;
  let verified = false;
  let passSent = false;
  let over = false;
  let gamePhase: GamePhase = GAME_WAITING;
  let attemptStartTick = 0;
  let fx: Fx[] = [];

  const stroke: SimStroke = {
    active: false,
    kind: 0,
    consumed: false,
    crossedStation: false,
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
    // Distinct ingredients (partial Fisher-Yates over the type indices).
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

  /** Ingredient types the order still needs. */
  const neededTypes = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < order.required.length; i++) if (order.filled[i] === 0) out.push(order.required[i]!);
    return out;
  };
  /** Is this a fresh ingredient the order needs right now? */
  const isNeeded = (it: Item): boolean => it.rotten === 0 && neededTypes().includes(it.type);

  function spawnNext(t: number): void {
    const needed = neededTypes();
    let type: number;
    let rotten: 0 | 1 = 0;
    if (needed.length > 0 && !api.chance(cfg.distractorChance)) {
      type = needed[api.randi(needed.length)]!;
    } else if (api.chance(0.5)) {
      type = api.randi(INGREDIENT_COUNT);
      rotten = 1;
    } else {
      const wrong: number[] = [];
      for (let k = 0; k < INGREDIENT_COUNT; k++) if (!needed.includes(k)) wrong.push(k);
      type = wrong.length > 0 ? wrong[api.randi(wrong.length)]! : api.randi(INGREDIENT_COUNT);
    }
    current = {
      id: nextItemId++,
      type,
      rotten,
      appearTick: t,
      expireTick: t + cfg.itemWindowTicks,
      phase: PHASE_COUNTER,
      station: DROP_NONE,
    };
  }

  function loseLife(where: number): void {
    lives = Math.max(0, lives - 1);
    fx.push({ kind: 'mistake', where });
  }
  const clearItem = (): void => {
    current = null;
    respawn = RESPAWN_TICKS;
  };

  /** A drag of the prep item just ended (item is PHASE_COUNTER). Resolve the drop. */
  function resolveDrop(): void {
    const it = current!;
    const span = Math.max(stroke.maxX - stroke.minX, stroke.maxY - stroke.minY);
    if (span < MIN_DRAG_SPAN) return; // a nick, not a drag: item stays on the counter
    const target = geom.dropTarget(stroke.lastX, stroke.lastY);
    if (target === DROP_NONE) return; // dropped on empty space: item stays

    const needed = isNeeded(it);
    if (target === DROP_TRASH) {
      if (needed) loseLife(DROP_TRASH); // trashed an ingredient the order needed
      else fx.push({ kind: 'trash', where: DROP_TRASH }); // correctly discarded a distractor
      clearItem();
      return;
    }
    if (!needed) {
      loseLife(target); // tried to cook a wrong / rotten ingredient
      clearItem();
      return;
    }
    if (target !== stationOf(it.type)) {
      loseLife(target); // a needed ingredient, but the wrong station
      clearItem();
      return;
    }
    it.phase = PHASE_STATION;
    it.station = target;
  }

  /** Mark the stroke as having cut through the current item's station, if the segment
   *  from the stroke's last point to (x, y) passes within GESTURE_HIT_R of it. */
  function markCross(station: number, x: number, y: number): void {
    if (stroke.crossedStation) return;
    const s = STATIONS[station]!;
    if (swipeHitsCircle(stroke.lastX, stroke.lastY, x, y, s.x, s.y, HIT_R2)) stroke.crossedStation = true;
  }

  /** Called as the gesture stroke grows (item is PHASE_STATION). Cook the moment the
   *  station's motion is complete, mid-hold; consume the stroke so the rest is ignored. */
  function tryCook(t: number): void {
    const it = current!;
    if (!stroke.crossedStation || !isGestureComplete(stroke, it.station)) return;
    stroke.consumed = true;
    if (!isHumanReaction(it.appearTick, t, REACTION_TICKS)) {
      clearItem(); // R1: a too-fast cook is consumed but does not fill
      return;
    }
    let req = -1;
    for (let i = 0; i < order.required.length; i++) {
      if (order.required[i] === it.type && order.filled[i] === 0) {
        req = i;
        break;
      }
    }
    if (req >= 0) {
      order.filled[req] = 1;
      fx.push({ kind: 'cook', where: it.station });
      if (order.filled.every((f) => f === 1)) {
        dishesServed += 1;
        fx.push({ kind: 'serve', where: it.station });
        if (!verified && dishesServed >= cfg.passScore) verified = true;
        else order = newOrder();
      }
    }
    clearItem();
  }

  function expire(t: number): void {
    if (!current || t < current.expireTick) return;
    if (isNeeded(current)) {
      lives = Math.max(0, lives - 1); // a needed ingredient ran out of time: a miss
      fx.push({ kind: 'spoil', where: current.phase === PHASE_STATION ? current.station : DROP_NONE });
    }
    clearItem();
  }

  /** Begin (or restart) a round. `freshScore` zeroes the dishes served (a try-again
   *  before verifying); a new recipe is drawn (RNG continues, a fresh challenge). */
  function startRound(t: number, freshScore: boolean, newRecipe: boolean): void {
    gamePhase = GAME_PLAYING;
    attemptStartTick = t;
    lives = cfg.lives;
    current = null;
    respawn = 0; // spawn the first item this tick
    stroke.active = false;
    if (freshScore) dishesServed = 0;
    if (newRecipe) order = newOrder();
  }

  /** Is this point inside the current overlay's button (start / keep playing / try
   *  again)? A tap only advances the lifecycle when it lands on the button. Decided by
   *  the injected geometry (Excalibur collider in-engine, integer box for the red-team). */
  function inButton(x: number, y: number): boolean {
    return geom.inButton(gamePhase, x, y);
  }

  /** Handle the play-input pointer events while PLAYING (drag + cooking gesture). */
  function playInput(ev: { kind: 0 | 1 | 2; x: number; y: number }, t: number): void {
    if (ev.kind === 0) {
      stroke.anchorX = ev.x;
      stroke.anchorY = ev.y;
      stroke.lastX = ev.x;
      stroke.lastY = ev.y;
      stroke.minX = ev.x;
      stroke.maxX = ev.x;
      stroke.minY = ev.y;
      stroke.maxY = ev.y;
      stroke.pathLen = 0;
      stroke.consumed = false;
      stroke.crossedStation = false;
      if (current && current.phase === PHASE_COUNTER && geom.onPrepItem(ev.x, ev.y)) {
        stroke.active = true;
        stroke.kind = 1; // drag the prep item
      } else if (current && current.phase === PHASE_STATION) {
        stroke.active = true;
        stroke.kind = 2; // a cooking gesture - starts on any press, even outside the station
        markCross(current.station, ev.x, ev.y);
      } else {
        stroke.active = false;
        stroke.kind = 0;
      }
    } else if (ev.kind === 1) {
      if (stroke.active) {
        if (stroke.kind === 2 && current) markCross(current.station, ev.x, ev.y);
        accumulate(stroke, ev.x, ev.y);
        if (stroke.kind === 2 && !stroke.consumed && current) tryCook(t);
      }
    } else {
      if (stroke.active) {
        if (stroke.kind === 2 && current) markCross(current.station, ev.x, ev.y);
        accumulate(stroke, ev.x, ev.y);
        if (current) {
          if (stroke.kind === 1) resolveDrop();
          else if (stroke.kind === 2 && !stroke.consumed) tryCook(t);
        }
      }
      stroke.active = false;
    }
  }

  return {
    tick(): void {
      if (over) return;
      const t = api.tick;
      fx = [];

      for (const ev of api.pointer.events) {
        if (gamePhase === GAME_WAITING) {
          if (ev.kind === 0 && inButton(ev.x, ev.y)) startRound(t, false, false); // start button
          continue;
        }
        if (gamePhase === GAME_WON) {
          if (ev.kind === 0 && inButton(ev.x, ev.y)) startRound(t, false, true); // keep playing button
          continue;
        }
        if (gamePhase === GAME_LOST) {
          if (ev.kind === 0 && inButton(ev.x, ev.y)) startRound(t, !verified, true); // try again button
          continue;
        }
        playInput(ev, t);
      }

      if (gamePhase !== GAME_PLAYING) {
        api.setScore(dishesServed);
        return;
      }

      if (current) expire(t);
      if (current === null) {
        respawn -= 1;
        if (respawn <= 0) spawnNext(t);
      }

      if (verified && !passSent) {
        passSent = true;
        api.pass();
        api.setScore(dishesServed);
        if (api.headless) {
          over = true; // the replay terminates at the win
          api.gameOver();
          return;
        }
        gamePhase = GAME_WON; // live: success screen, then keep playing
        return;
      }
      if (lives <= 0 || (!verified && t - attemptStartTick >= cfg.timeBudgetTicks)) {
        gamePhase = GAME_LOST;
        api.setScore(dishesServed);
        return;
      }
      api.setScore(dishesServed);
    },

    view(): SimView {
      return {
        item: current,
        order,
        dishesServed,
        lives,
        tick: api.tick,
        passScore: cfg.passScore,
        verified,
        over,
        gamePhase,
        dragging: stroke.active && stroke.kind === 1,
        fx,
      };
    },
  };
}

/** Extend a stroke by one sample: grow the path length + bounding box. */
function accumulate(s: SimStroke, x: number, y: number): void {
  s.pathLen += Math.max(Math.abs(x - s.lastX), Math.abs(y - s.lastY));
  s.lastX = x;
  s.lastY = y;
  if (x < s.minX) s.minX = x;
  if (x > s.maxX) s.maxX = x;
  if (y < s.minY) s.minY = y;
  if (y > s.maxY) s.maxY = y;
}
