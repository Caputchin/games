// The headless Dino Runner reducer. `defineEngine` declares the pure
// state machine the kit drives both ways: the live driver advances it one
// logical tick at a time (recording jump/duck actions tick-stamped) and the
// server replays the SAME ticks over (seed, config, trace). Identical inputs =>
// identical outcome, which makes the server's replayed verdict trustworthy.
//
// Determinism rules obeyed here: all randomness comes from `rng` (seeded
// from the server seed, state kept in SimState.rng); the jump arc uses the same
// physics constants as the original Runner class; no Date / Math.random / DOM /
// async. State is threaded linearly; mutation-in-place is fine (single thread,
// no aliasing across ticks).

import { defineEngine } from '@caputchin/engine-kit';
import { rng, rngFromState } from '@caputchin/determinism';
import {
  STEP_S,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BOTTOM_PAD,
  GROUND_BASELINE,
  RUNNER_WIDTH,
  RUNNER_HEIGHT,
  RUNNER_WIDTH_DUCK,
  RUNNER_START_X,
  GROUND_Y,
  JUMP_DROP_VELOCITY,
  JUMP_SPEED_DROP_COEFFICIENT,
  JUMP_MIN_JUMP_RISE,
  JUMP_AUTO_CAP_RISE,
  JUMP_CEILING_Y,
  SCORE_COEFFICIENT,
  MAX_OBSTACLE_LENGTH,
  MAX_OBSTACLE_DUPLICATION,
  BIRD_SPEED_OFFSET,
  ANIM_TICKS_RUN,
  ANIM_TICKS_DUCK,
  ANIM_TICKS_BIRD,
  RUNNER_BOXES_RUNNING,
  RUNNER_BOXES_DUCKING,
} from './constants.js';
import { resolveSimConfig } from '../config.js';
import type { SimState, SimAction, SimConfig, SimView, SimRunner, SimObstacle, SimBox, ObstacleTypeId } from './types.js';

/** The raw dashboard config the engine resolves internally (flat scalar map or
 *  null). The engine never trusts its shape - resolveSimConfig validates and
 *  clamps every field, and resolves null -> the game's defaults. */
type RawConfig = Record<string, unknown>;

// ---- Obstacle type catalog -----------------------------------------------
// (Verbatim from obstacles.ts - same collision box sets.)

interface ObstacleType {
  id: ObstacleTypeId;
  width: number;
  height: number;
  yPos: number | readonly number[];
  boxes: readonly SimBox[];
  minGap: number;
  minSpeed: number;
  groupable: boolean;
  groupSpeed: number;
}

const OBSTACLE_TYPES: Record<ObstacleTypeId, ObstacleType> = {
  'cactus-small': {
    id: 'cactus-small',
    width: 17,
    height: 35,
    yPos: 105,
    minGap: 120,
    minSpeed: 0,
    groupable: true,
    groupSpeed: 4,
    boxes: [
      { x: 0, y: 7, width: 5, height: 27 },
      { x: 4, y: 0, width: 6, height: 34 },
      { x: 10, y: 4, width: 7, height: 14 },
    ],
  },
  'cactus-large': {
    id: 'cactus-large',
    width: 25,
    height: 50,
    yPos: 90,
    minGap: 120,
    minSpeed: 0,
    groupable: true,
    groupSpeed: 7,
    boxes: [
      { x: 0, y: 12, width: 7, height: 38 },
      { x: 8, y: 0, width: 7, height: 49 },
      { x: 13, y: 10, width: 10, height: 38 },
    ],
  },
  bird: {
    id: 'bird',
    width: 46,
    height: 40,
    yPos: [100, 75, 50],
    minGap: 150,
    minSpeed: 0,
    groupable: false,
    groupSpeed: Infinity,
    boxes: [
      { x: 15, y: 15, width: 16, height: 5 },
      { x: 18, y: 21, width: 24, height: 6 },
      { x: 2, y: 14, width: 4, height: 3 },
      { x: 6, y: 10, width: 4, height: 7 },
      { x: 10, y: 8, width: 6, height: 9 },
    ],
  },
};

// ---- Obstacle helpers ----------------------------------------------------

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Whether the last MAX_OBSTACLE_DUPLICATION obstacles are all this type. */
function wouldOverduplicate(obstacles: readonly SimObstacle[], id: ObstacleTypeId): boolean {
  if (obstacles.length < MAX_OBSTACLE_DUPLICATION) return false;
  const tail = obstacles.slice(-MAX_OBSTACLE_DUPLICATION);
  return tail.every((o) => o.typeId === id);
}

function computeGap(type: ObstacleType, width: number, speed: number, gapCoefficient: number, rng: () => number): number {
  const minGap = Math.round(width * speed + type.minGap * gapCoefficient);
  const maxGap = Math.round(minGap * 1.5);
  return randInt(rng, minGap, maxGap);
}

/** Pick a spawn type at this speed, honoring the bird gate + dup cap. */
function pickType(
  obstacles: readonly SimObstacle[],
  speed: number,
  cfg: SimConfig,
  rng: () => number,
): ObstacleType | null {
  const candidates: ObstacleType[] = [OBSTACLE_TYPES['cactus-small'], OBSTACLE_TYPES['cactus-large']];
  if (cfg.birdsEnabled && speed >= cfg.birdMinSpeed) candidates.push(OBSTACLE_TYPES.bird);
  const eligible = candidates.filter((t) => speed >= t.minSpeed);
  const allowed = eligible.filter((t) => !wouldOverduplicate(obstacles, t.id));
  const pool = allowed.length > 0 ? allowed : eligible;
  if (pool.length === 0) return null;
  return pool[randInt(rng, 0, pool.length - 1)]!;
}

/** Spawn one obstacle at the right edge. Mutates state.rng. */
function spawnObstacle(state: SimState): SimObstacle | null {
  const r = rngFromState(state.rng);
  const next = (): number => r.next();

  const type = pickType(state.obstacles, state.speed, state.cfg, next);
  if (!type) {
    state.rng = r.state;
    return null;
  }

  const size =
    type.groupable && state.speed > type.groupSpeed ? randInt(next, 1, MAX_OBSTACLE_LENGTH) : 1;
  const width = type.width * size;

  let y: number;
  let speedOffset = 0;
  if (type.id === 'bird') {
    const heights = type.yPos as readonly number[];
    y = heights[randInt(next, 0, heights.length - 1)]!;
    speedOffset = next() > 0.5 ? BIRD_SPEED_OFFSET : -BIRD_SPEED_OFFSET;
  } else {
    y = type.yPos as number;
  }

  const boxes: SimBox[] = [];
  for (let k = 0; k < size; k += 1) {
    for (const b of type.boxes) {
      boxes.push({ x: b.x + k * type.width, y: b.y, width: b.width, height: b.height });
    }
  }

  const o: SimObstacle = {
    typeId: type.id,
    x: WORLD_WIDTH,
    y,
    width,
    height: type.height,
    size,
    boxes,
    gap: computeGap(type, width, state.speed, state.cfg.gapCoefficient, next),
    speedOffset,
    frame: 0,
    animTimer: 0,
  };

  state.rng = r.state;
  return o;
}

// ---- Runner helpers (pure, operating on SimRunner) ------------------------

function advanceSpeed(speed: number, maxSpeed: number, acceleration: number, frames: number): number {
  if (speed >= maxSpeed) return maxSpeed;
  return Math.min(maxSpeed, speed + acceleration * frames);
}

function toScore(distanceRan: number): number {
  return Math.floor(distanceRan * SCORE_COEFFICIENT);
}

/** Integrate the runner's jump arc by `frames` reference-frames worth of
 *  STEP_S time. Mirrors Runner.update's jump block exactly. */
function runnerUpdateJump(runner: SimRunner, frames: number, gravity: number): void {
  if (runner.status !== 'jumping') return;
  const speedDropMul = runner.speedDrop ? JUMP_SPEED_DROP_COEFFICIENT : 1;
  runner.y += runner.velocity * speedDropMul * frames;
  runner.velocity += gravity * frames;

  if (runner.y <= GROUND_Y - JUMP_MIN_JUMP_RISE) runner.reachedMinHeight = true;
  if (runner.y < GROUND_Y - JUMP_AUTO_CAP_RISE || runner.speedDrop) {
    // endJump: cap rising velocity
    if (runner.reachedMinHeight && runner.velocity < JUMP_DROP_VELOCITY) {
      runner.velocity = JUMP_DROP_VELOCITY;
    }
  }
  if (runner.y < JUMP_CEILING_Y) {
    runner.y = JUMP_CEILING_Y;
    if (runner.velocity < 0) runner.velocity = 0;
  }
  if (runner.y >= GROUND_Y) {
    runner.y = GROUND_Y;
    runner.velocity = 0;
    runner.jumpCount += 1;
    runner.status = runner.duckHeld ? 'ducking' : 'running';
    runner.speedDrop = false;
    runner.reachedMinHeight = false;
  }
}

/** Advance animation timers by one logical tick. */
function runnerAdvanceAnim(runner: SimRunner): void {
  if (runner.status === 'running') {
    runner.runTimer += 1;
    if (runner.runTimer >= ANIM_TICKS_RUN) {
      runner.runTimer = 0;
      runner.runFrame ^= 1;
    }
  } else if (runner.status === 'ducking') {
    runner.duckTimer += 1;
    if (runner.duckTimer >= ANIM_TICKS_DUCK) {
      runner.duckTimer = 0;
      runner.duckFrame ^= 1;
    }
  }
}

// ---- Collision -----------------------------------------------------------
// RUNNER_BOXES_RUNNING and RUNNER_BOXES_DUCKING are imported from ./constants.js
// (the single source of truth) so collision.ts + engine.ts never drift.

function boxesIntersect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function checkCollision(runner: SimRunner, obstacles: readonly SimObstacle[]): boolean {
  const ducking = runner.status === 'ducking';
  const rBoxes = ducking ? RUNNER_BOXES_DUCKING : RUNNER_BOXES_RUNNING;
  for (const o of obstacles) {
    if (o.x > runner.x + 60 || o.x + o.width < runner.x - 10) continue;
    for (const rb of rBoxes) {
      const rx = rb.x + runner.x;
      const ry = rb.y + runner.y;
      for (const ob of o.boxes) {
        const ox = ob.x + o.x;
        const oy = ob.y + o.y;
        if (boxesIntersect(rx, ry, rb.width, rb.height, ox, oy, ob.width, ob.height)) return true;
      }
    }
  }
  return false;
}

// ---- defineEngine --------------------------------------------------------

export const engine = defineEngine<SimState, SimAction, RawConfig, SimView>({
  init({ seed, config }) {
    const r = rng(seed);
    // ONE transform site: raw dashboard config (or null) -> this round's
    // SimConfig. Live play and replay both arrive here, so they cannot diverge.
    const cfg = resolveSimConfig(config);
    const runner: SimRunner = {
      x: RUNNER_START_X,
      y: GROUND_Y,
      velocity: 0,
      duckHeld: false,
      speedDrop: false,
      reachedMinHeight: false,
      runTimer: 0,
      runFrame: 0,
      duckTimer: 0,
      duckFrame: 0,
      jumpCount: 0,
      status: 'waiting',
    };
    return {
      rng: r.state,
      cfg,
      runner,
      obstacles: [],
      speed: cfg.startSpeed,
      distanceRan: 0,
      verified: false,
      tick: 0,
    };
  },

  step(state, action) {
    // Actions only land while the runner is alive and at least waiting.
    if (state.runner.status === 'crashed') return state;

    if (action.k === 'jump_press') {
      if (state.runner.status === 'waiting') {
        // First input starts the run.
        state.runner.status = 'running';
      } else if (state.runner.status === 'running' || state.runner.status === 'ducking') {
        // Start a jump.
        state.runner.status = 'jumping';
        state.runner.speedDrop = false;
        state.runner.reachedMinHeight = false;
        // Faster runs get a touch more lift (mirrors Runner.startJump).
        state.runner.velocity = -state.cfg.jumpVelocity - state.speed / 10;
      }
    } else if (action.k === 'jump_release') {
      if (state.runner.status === 'jumping' && state.runner.reachedMinHeight) {
        if (state.runner.velocity < JUMP_DROP_VELOCITY) {
          state.runner.velocity = JUMP_DROP_VELOCITY;
        }
      }
    } else if (action.k === 'duck_press') {
      state.runner.duckHeld = true;
      if (state.runner.status === 'jumping') {
        state.runner.speedDrop = true;
        state.runner.velocity = 1;
      } else if (state.runner.status === 'running') {
        state.runner.status = 'ducking';
      }
    } else if (action.k === 'duck_release') {
      state.runner.duckHeld = false;
      state.runner.speedDrop = false;
      if (state.runner.status === 'ducking') state.runner.status = 'running';
    }
    return state;
  },

  tick(state) {
    if (state.runner.status === 'crashed') return state;
    if (state.runner.status === 'waiting') return state;

    state.tick += 1;
    // frames = 1 since STEP_S is exactly one tick width; physics constants are
    // already per-frame (same as the original: MS_PER_FRAME = 16.67ms ≈ STEP_S).
    const frames = 1;

    // Speed progression + distance.
    state.speed = advanceSpeed(state.speed, state.cfg.maxSpeed, state.cfg.acceleration, frames);
    state.distanceRan += state.speed * frames;

    // Runner physics.
    runnerUpdateJump(state.runner, frames, state.cfg.gravity);
    runnerAdvanceAnim(state.runner);

    // Obstacle scroll + animation.
    for (const o of state.obstacles) {
      o.x -= (state.speed + o.speedOffset) * frames;
      if (o.typeId === 'bird') {
        o.animTimer += 1;
        if (o.animTimer >= ANIM_TICKS_BIRD) {
          o.animTimer = 0;
          o.frame ^= 1;
        }
      }
    }

    // Drop fully off-screen obstacles.
    while (state.obstacles.length > 0 && state.obstacles[0]!.x + state.obstacles[0]!.width < 0) {
      state.obstacles.shift();
    }

    // Spawn if the right edge is clear.
    const last = state.obstacles[state.obstacles.length - 1];
    const needsSpawn = !last || last.x + last.width + last.gap <= WORLD_WIDTH;
    if (needsSpawn) {
      const o = spawnObstacle(state);
      if (o) state.obstacles.push(o);
    }

    // Pass gate - check before collision so a borderline run that hits an
    // obstacle in the same tick that it crosses the threshold still counts.
    const score = toScore(state.distanceRan);
    if (!state.verified && score >= state.cfg.passScore) {
      state.verified = true;
    }

    // Collision.
    if (checkCollision(state.runner, state.obstacles)) {
      state.runner.status = 'crashed';
    }

    return state;
  },

  isOver(state) {
    return state.runner.status === 'crashed';
  },

  result(state) {
    // Engine owns the pass decision: `verified` latches once distanceScore
    // crossed cfg.passScore during the run (set in tick, before collision). The
    // score is monotonic, so at game-over verified == (score >= passScore).
    return { score: toScore(state.distanceRan), passed: state.verified };
  },

  view(state) {
    return {
      runner: state.runner,
      obstacles: state.obstacles,
      speed: state.speed,
      distanceRan: state.distanceRan,
      verified: state.verified,
      crashed: state.runner.status === 'crashed',
    };
  },
});

/** Exported for tests: toScore function. */
export { toScore };

/** Exported for tests and the live driver: the runner ground Y constant. */
export { GROUND_Y as SIM_GROUND_Y };
