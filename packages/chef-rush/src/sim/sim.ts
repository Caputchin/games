// The Chef Rush simulation - the high-trust gate logic, run inside the engine's
// fixed update (api.onTick) on BOTH ends. It reads input + randomness ONLY through
// the preset api (so live and replay agree) and owns the pass/fail decision.
//
// Anti-cheat rules implemented here (the captcha-game design standard):
//   F2  every gate-affecting value (station, direction, kind, timing) comes from
//       the server seed via api.rand*.
//   R1  a gesture resolving < REACTION_TICKS after a prompt became actionable is
//       superhuman and does not score.
//   R2  gesturing a SPOILED prompt is fatal (lives -> 0); spoiled density + a
//       per-prompt expiry window provide the bad-target density + time pressure,
//       so an indiscriminate "gesture everything" bot loses before it passes.
//   U6  a gesture only registers after the stroke sweeps >= MIN_GESTURE_SPAN, so
//       the captured motor input is a rich path (drag) the input-signature judge
//       scores, not a contentless tap.
//   U2  `verified` latches when served >= passScore; result/pass read only that.

import { isHumanReaction } from '@caputchin/engine-kit';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';
import {
  DIR_COUNT,
  MIN_GESTURE_SPAN,
  RAMP_TICKS,
  REACTION_TICKS,
  SPAWN_INTERVAL_MIN_TICKS,
  SPOILED_CHANCE_MAX,
  STATION_COUNT,
} from './constants';
import { dirOf, span, stationAt } from './gestures';
import { GOOD, SPOILED, type ChefConfig, type Fx, type Prompt, type SimView } from './types';

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

export function createChefSim(api: ExcaliburGameApi, cfg: ChefConfig): ChefSim {
  let prompts: Prompt[] = [];
  let nextId = 0;
  let spawnTimer = 0;
  let score = 0;
  let lives = cfg.lives;
  let verified = false;
  let over = false;
  let fx: Fx[] = [];

  const stroke = { active: false, consumed: false, anchorX: 0, anchorY: 0, station: -1 };

  const promptAtStation = (st: number): Prompt | undefined =>
    prompts.find((p) => p.station === st && p.served === 0);

  /** Resolve the current stroke against the station it pressed down on, once it
   *  has swept a genuine span (U6). One stroke resolves at most one prompt. */
  function evaluate(curX: number, curY: number, tick: number): void {
    if (span(stroke.anchorX, stroke.anchorY, curX, curY) < MIN_GESTURE_SPAN) return;
    stroke.consumed = true;
    const st = stroke.station;
    if (st < 0) return; // slashed empty space
    const p = promptAtStation(st);
    if (!p) return; // nothing to act on at that station

    if (p.kind === SPOILED) {
      // R2: touching a spoiled station with a real gesture ends the round.
      lives = 0;
      p.served = 1;
      fx.push({ kind: 'spoiled', station: st });
      return;
    }
    // GOOD: the gesture must be in the prompted direction.
    if (dirOf(curX - stroke.anchorX, curY - stroke.anchorY) !== p.dir) return;
    p.served = 1;
    // R1: a too-fast resolve is consumed but does not score.
    if (isHumanReaction(p.appearTick, tick, REACTION_TICKS)) {
      score += 1;
      fx.push({ kind: 'serve', station: st });
    }
  }

  function spawn(tick: number): void {
    const interval = ramp(tick, cfg.spawnIntervalTicks, SPAWN_INTERVAL_MIN_TICKS);
    spawnTimer += 1;
    if (spawnTimer < interval) return;
    spawnTimer = 0;
    // Pick a free station (no active prompt). If all busy, skip this spawn.
    const free: number[] = [];
    for (let i = 0; i < STATION_COUNT; i++) if (!promptAtStation(i)) free.push(i);
    if (free.length === 0) return;
    const station = free[api.randi(free.length)]!;
    const spoiledChance = ramp(tick, cfg.spoiledChance, SPOILED_CHANCE_MAX);
    const kind = api.chance(spoiledChance) ? SPOILED : GOOD;
    const dir = api.randi(DIR_COUNT);
    prompts.push({
      id: nextId++,
      station,
      dir,
      kind,
      appearTick: tick,
      expireTick: tick + cfg.gestureWindowTicks,
      served: 0,
    });
  }

  function expire(tick: number): void {
    for (const p of prompts) {
      if (p.served === 0 && tick >= p.expireTick) {
        p.served = 1;
        // A missed GOOD prompt costs a life; a correctly-ignored SPOILED is free.
        if (p.kind === GOOD) {
          lives = Math.max(0, lives - 1);
          fx.push({ kind: 'miss', station: p.station });
        } else {
          fx.push({ kind: 'expire', station: p.station });
        }
      }
    }
    if (prompts.some((p) => p.served === 1)) prompts = prompts.filter((p) => p.served === 0);
  }

  return {
    tick(): void {
      if (over) return;
      const t = api.tick;
      fx = [];

      // Drain this tick's pointer input.
      for (const ev of api.pointer.events) {
        if (ev.kind === 0) {
          stroke.active = true;
          stroke.consumed = false;
          stroke.anchorX = ev.x;
          stroke.anchorY = ev.y;
          stroke.station = stationAt(ev.x, ev.y);
        } else if (ev.kind === 1) {
          if (stroke.active && !stroke.consumed) evaluate(ev.x, ev.y, t);
        } else {
          stroke.active = false;
        }
      }

      spawn(t);
      expire(t);

      if (lives <= 0) {
        over = true;
        api.setScore(score);
        api.gameOver();
        return;
      }
      if (!verified && score >= cfg.passScore) {
        verified = true;
        api.setScore(score);
        api.pass();
        over = true;
        api.gameOver();
        return;
      }
      if (t >= cfg.timeBudgetTicks) {
        over = true;
        api.setScore(score);
        api.gameOver();
        return;
      }
      api.setScore(score);
    },

    view(): SimView {
      return {
        prompts,
        score,
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
