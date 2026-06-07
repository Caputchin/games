// The headless Fruit Slash reducer. `defineEngine` declares the pure
// state machine the kit drives both ways: the live driver steps it frame-by-frame
// (recording the pointer inputs as the opaque trace) and the server replays the
// SAME ticks over (seed, config, trace). Identical inputs => identical outcome,
// which is what makes the server's replayed verdict trustworthy.
//
// Determinism rules obeyed here: all randomness comes from `rng` (seeded from
// the server seed, state kept in SimState); the only transcendentals (launch
// sqrt, ramp exp) go through `capMath`; no Date / Math.random / DOM / async.
// State is threaded linearly by the kit, so the reducer mutates in place and
// returns the same reference (no aliasing, faster than cloning each tick).

import { defineEngine, isHumanReaction, reactionFloorTicks } from '@caputchin/engine-kit';
import { rng, rngFromState, capMath } from '@caputchin/determinism';
import { integrate, isOffBottom } from './launch.js';
import { swipeHitsCircle } from './geometry.js';
import { evaluate } from './scoring.js';
import { difficultyAt } from './progression.js';
import { pickInterval, spawnOne } from './spawn.js';
import {
  launchBounds,
  HIT_PAD,
  MAX_CONCURRENT,
  STEP_S,
  TARGET_RADIUS,
} from './constants.js';
import { resolveSimConfig } from './config.js';
import { GOOD, type Fx, type SimAction, type SimState, type SimView } from './types.js';

/** The raw dashboard config the engine resolves internally (flat scalar map or
 *  null). The engine never trusts its shape - resolveSimConfig validates,
 *  clamps, and resolves null -> defaults. */
type RawConfig = Record<string, unknown>;

/** Render-cue cap so a long replay (which never drains fx) can't grow it
 *  unbounded. The live driver clears fx every logical tick, so it never nears
 *  this; replay keeps only the most recent cues (it ignores them entirely). */
const FX_CAP = 64;

/** Reaction-time floor in logical ticks: a good-fruit slice landing fewer than
 *  this many ticks after the fruit launched is superhuman (a frame-perfect bot)
 *  and does not score. Kit default, conservatively below human reaction. */
const REACTION_TICKS = reactionFloorTicks();

function pushFx(state: SimState, fx: Fx): void {
  state.fx.push(fx);
  if (state.fx.length > FX_CAP) state.fx.shift();
}

/** Apply one swipe segment against the live targets, scoring every hit. */
function sliceSegment(state: SimState, ax: number, ay: number, bx: number, by: number): void {
  const path = [
    { x: ax, y: ay },
    { x: bx, y: by },
  ];
  const r = TARGET_RADIUS + HIT_PAD;
  for (const t of state.targets) {
    if (t.sliced) continue;
    if (!swipeHitsCircle(path, { x: t.x, y: t.y, r })) continue;
    t.sliced = 1;
    if (t.kind === GOOD) {
      // Reaction-time gate: a slice landing too soon after the fruit launched is
      // superhuman (a frame-perfect offline solver). The fruit is consumed but
      // does NOT score, so such a round never reaches passScore. A real player's
      // reaction is far above the floor, so live play is unaffected.
      if (isHumanReaction(t.spawnTick, state.tick, REACTION_TICKS)) {
        state.sliced += 1;
        pushFx(state, { kind: 'slice', x: t.x, y: t.y, hue: t.hue });
        if (evaluate({ sliced: state.sliced, lives: state.lives, passScore: state.cfg.passScore }) === 'pass') {
          state.verified = 1;
        }
      }
    } else {
      // Slicing a bomb ends the round instantly (genre standard, and a hard
      // bot-resistance guard): an indiscriminate "swipe everything" bot hits a
      // bomb long before it slices passScore good fruit, so it loses. A real
      // player never slices a bomb, so this never bites a human; the `lives`
      // buffer still absorbs missed good fruit. Zeroing lives trips isOver.
      state.lives = 0;
      pushFx(state, { kind: 'bomb', x: t.x, y: t.y, hue: t.hue });
    }
  }
}

export const engine = defineEngine<SimState, SimAction, RawConfig, SimView>({
  init({ seed, config }) {
    const r = rng(seed);
    // ONE transform site: raw dashboard config (or null) -> this round's
    // SimConfig. Live play and replay both arrive here, so they cannot diverge.
    const cfg = resolveSimConfig(config);
    // Draw the first interval BEFORE capturing rng.state, so the stored state
    // reflects that draw and tick()'s rngFromState resumes the exact stream.
    const interval = pickInterval(() => r.next(), cfg.spawnRate);
    return {
      rng: r.state,
      cfg,
      targets: [],
      nextId: 0,
      spawnTimer: 0,
      interval,
      sliced: 0,
      lives: cfg.lives,
      elapsed: 0,
      tick: 0,
      pointerDown: 0,
      lastX: 0,
      lastY: 0,
      hasLast: 0,
      verified: 0,
      fx: [],
    };
  },

  step(state, action) {
    if (action.k === 0) {
      // pointer down: anchor the swipe, no slice yet
      state.pointerDown = 1;
      state.lastX = action.x;
      state.lastY = action.y;
      state.hasLast = 1;
    } else if (action.k === 1) {
      // pointer move: slice the segment from the last point to this one
      if (state.pointerDown && state.hasLast) {
        sliceSegment(state, state.lastX, state.lastY, action.x, action.y);
      }
      state.lastX = action.x;
      state.lastY = action.y;
      state.hasLast = 1;
    } else {
      // pointer up: end the swipe
      state.pointerDown = 0;
      state.hasLast = 0;
    }
    return state;
  },

  tick(state) {
    state.tick += 1;
    // Cull targets sliced last tick (the renderer has drawn their splatter).
    if (state.targets.some((t) => t.sliced)) {
      state.targets = state.targets.filter((t) => !t.sliced);
    }

    state.elapsed += STEP_S;
    const diff = difficultyAt(state.elapsed, {
      spawnRate: state.cfg.spawnRate,
      hazardChance: state.cfg.hazardChance,
    });

    const bounds = launchBounds(state.cfg.gravity);
    const r = rngFromState(state.rng);
    const next = (): number => r.next();

    // Emit due spawns (respecting maxConcurrent). `while` so a single logical
    // tick can never owe more than its fixed slice; maxConcurrent bounds it.
    state.spawnTimer += STEP_S;
    while (state.spawnTimer >= state.interval) {
      state.spawnTimer -= state.interval;
      state.interval = pickInterval(next, diff.spawnRate);
      if (state.targets.length < MAX_CONCURRENT) {
        state.targets.push(spawnOne(next, bounds, diff.hazardChance, state.nextId++, state.tick));
      }
    }

    // Integrate every live target; split off any that exited the bottom (a
    // missed good fruit costs a life; a dodged bomb is harmless).
    const survivors = [];
    for (const t of state.targets) {
      const s = integrate({ x: t.x, y: t.y, vx: t.vx, vy: t.vy }, state.cfg.gravity, STEP_S);
      t.x = s.x;
      t.y = s.y;
      t.vy = s.vy;
      if (isOffBottom(t, bounds.height, bounds.radius)) {
        if (t.kind === GOOD) {
          state.lives = Math.max(0, state.lives - 1);
          pushFx(state, { kind: 'miss', x: t.x, y: t.y, hue: t.hue });
        }
      } else {
        survivors.push(t);
      }
    }
    state.targets = survivors;
    state.rng = r.state;
    return state;
  },

  isOver(state) {
    return state.lives <= 0;
  },

  result(state) {
    // Engine owns the pass decision: `verified` latches (in step) once the
    // sliced count reaches cfg.passScore. score = good fruit sliced.
    return { score: state.sliced, passed: state.verified === 1 };
  },

  view(state) {
    return {
      targets: state.targets,
      sliced: state.sliced,
      lives: state.lives,
      verified: state.verified,
      fx: state.fx,
    };
  },
});
