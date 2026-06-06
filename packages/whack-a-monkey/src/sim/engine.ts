// The headless Whack-a-Monkey reducer. `defineEngine` declares the
// pure state machine the kit drives both ways: the live driver steps it
// tick-by-tick (recording tap inputs as the opaque trace) and the server
// replays the SAME ticks over (seed, config, trace). Identical inputs =>
// identical outcome - that is what makes the server's replayed verdict
// trustworthy.
//
// Determinism rules obeyed here: all randomness comes from `rng` (seeded
// from the server seed, state kept in SimState); no Date / Math.random / DOM /
// async. State is threaded linearly by the kit; the reducer mutates in place
// and returns the same reference (no aliasing, faster than cloning each tick).
//
// Fixed-step design: the live driver advances the sim one logical tick (STEP_S)
// at a time via a fixed-step accumulator loop, recording any tap that arrived
// in that tick window. The server replays the exact same ticks. Variable real
// dt is a live-driver concern only - the sim never sees it.

import { defineEngine, isHumanReaction, reactionFloorTicks } from '@caputchin/engine-kit';
import { rng, rngFromState } from '@caputchin/determinism';
import {
  STEP_S,
  HOLE_COUNT,
  BASE_SPAWN_RATE,
  SPAWN_JITTER,
  MIN_INTERVAL,
  HOLE_COOLDOWN_FACTOR,
  MAX_CONCURRENT,
  MAX_CONCURRENT_DECOY,
  LEVEL_COUNT,
  RATE_PER_LEVEL,
  UPTIME_SHRINK_PER_LVL,
  DECOY_ADD_PER_LVL,
  DECOY_CAP,
  MIN_UPTIME_FLOOR_MS,
  DECOY_SPECIES,
  EMERGE_OMEGA,
  EMERGE_ZETA,
  EMERGE_INIT_VEL,
  RETRACT_OMEGA,
  RETRACT_ZETA,
  BASE_SCORE,
  TIMING_BONUS_MAX,
  DECOY_TIME_PENALTY_S,
  DECOY_PENALTY,
} from './constants.js';
import { resolveSimConfig } from './config.js';
import type { SimState, SimConfig, SimAction, SimView, SimMole, SimMolePhase, SimFx } from './types.js';

/** The raw dashboard config the engine resolves internally (flat scalar map or
 *  null). The engine never trusts its shape - resolveSimConfig validates,
 *  clamps, and resolves null -> defaults. */
type RawConfig = Record<string, unknown>;

/** Render-cue cap so a long replay (which never drains fx) can't grow it
 *  unbounded. The live driver clears fx every logical tick before applying
 *  actions, so it never nears this; replay keeps only the most recent cues
 *  (it ignores them entirely). */
const FX_CAP = 32;

/** Reaction-time floor in logical ticks: a monkey tap landing fewer than this
 *  many ticks after the mole rose to 'up' is superhuman (a frame-perfect bot)
 *  and does not score. Kit default, conservatively below human reaction. */
const REACTION_TICKS = reactionFloorTicks();

function pushFx(state: SimState, fx: SimFx): void {
  state.fx.push(fx);
  if (state.fx.length > FX_CAP) state.fx.shift();
}

// ── Spring ────────────────────────────────────────────────────────────────────

/** Semi-implicit (symplectic) Euler step of a damped spring toward `target`.
 *  Stable while dt < 2/omega; the fixed STEP_S guarantees this for every omega
 *  used here. Used for both the emergence animation (affects hit geometry) and
 *  retraction. */
function springStep(
  pos: number,
  vel: number,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): { pos: number; vel: number } {
  const accel = omega * omega * (target - pos) - 2 * zeta * omega * vel;
  const nextVel = vel + accel * dt;
  const nextPos = pos + nextVel * dt;
  return { pos: nextPos, vel: nextVel };
}

// ── Difficulty ladder ─────────────────────────────────────────────────────────

interface LevelParams {
  spawnRate: number;
  uptimeS: number;
  decoyChance: number;
  goal: number; // good hits to clear this level
}

function buildLadder(cfg: SimConfig): LevelParams[] {
  const total = Math.max(LEVEL_COUNT, Math.round(cfg.passHits));
  const base = Math.floor(total / LEVEL_COUNT);
  const levels: LevelParams[] = [];
  for (let n = 0; n < LEVEL_COUNT; n++) {
    const goal = n === LEVEL_COUNT - 1 ? total - base * (LEVEL_COUNT - 1) : base;
    levels.push({
      spawnRate: BASE_SPAWN_RATE * (1 + RATE_PER_LEVEL * n),
      uptimeS:
        Math.max(MIN_UPTIME_FLOOR_MS, cfg.baseUptimeMs * (1 - UPTIME_SHRINK_PER_LVL * n)) / 1000,
      decoyChance: Math.min(DECOY_CAP, cfg.baseDecoyChance + DECOY_ADD_PER_LVL * n),
      goal,
    });
  }
  return levels;
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

/** Pick a jittered inter-spawn interval (seconds). */
function pickInterval(next: () => number, spawnRate: number): number {
  const base = 1 / Math.max(0.1, spawnRate);
  const jitter = base * SPAWN_JITTER * (next() * 2 - 1);
  return Math.max(MIN_INTERVAL, base + jitter);
}

/** Count moles of a given kind that are in the 'up' phase. */
function countUp(moles: SimMole[], kind: SimMole['kind']): number {
  let n = 0;
  for (const m of moles) if (m.phase === 'up' && m.kind === kind) n++;
  return n;
}

// ── Mole lifecycle ────────────────────────────────────────────────────────────

/** Step one mole by dt seconds using the fixed springs. */
function stepMole(m: SimMole, dt: number): SimMole {
  if (m.phase === 'dead') return m;
  let phase: SimMolePhase = m.phase;
  const age = m.age + dt;
  if (phase === 'up' && age >= m.uptimeS) phase = 'retracting';
  const target = phase === 'up' ? 1 : 0;
  const omega = phase === 'up' ? EMERGE_OMEGA : RETRACT_OMEGA;
  const zeta = phase === 'up' ? EMERGE_ZETA : RETRACT_ZETA;
  const s = springStep(m.scaleY, m.scaleVel, target, omega, zeta, dt);
  let scaleY = s.pos;
  let scaleVel = s.vel;
  if (phase === 'retracting' && scaleY <= 0.02 && Math.abs(scaleVel) < 0.05) {
    phase = 'dead';
    scaleY = 0;
    scaleVel = 0;
  }
  return { ...m, phase, age, scaleY, scaleVel };
}

/** Freshness [0,1]: 1 the instant the mole rose, 0 just before it ducks. */
function timingFraction(m: SimMole): number {
  if (m.uptimeS <= 0) return 0;
  const f = 1 - m.age / m.uptimeS;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export const engine = defineEngine<SimState, SimAction, RawConfig, SimView>({
  init({ seed, config }) {
    const r = rng(seed);
    // ONE transform site: raw dashboard config (or null) -> this round's
    // SimConfig. Live play and replay both arrive here, so they cannot diverge.
    const cfg = resolveSimConfig(config);
    const ladder = buildLadder(cfg);
    const spawnRate = ladder[0]!.spawnRate;
    // Draw first interval before capturing state, so tick's rngFromState resumes
    // the exact stream.
    const interval = pickInterval(() => r.next(), spawnRate);
    return {
      rng: r.state,
      cfg,
      moles: [],
      nextId: 0,
      spawnTimer: 0,
      interval,
      goodHits: 0,
      score: 0,
      timeLeft: cfg.seconds,
      levelIndex: 0,
      hitsInLevel: 0,
      holeCooldowns: Array.from({ length: HOLE_COUNT }, () => 0),
      lastHole: -1,
      verified: 0,
      tick: 0,
      fx: [],
    };
  },

  step(state, action) {
    const { holeIndex } = action;
    if (holeIndex < 0 || holeIndex >= HOLE_COUNT) return state;
    // Find the tappable mole at this hole.
    const moleIdx = state.moles.findIndex(
      (m) => m.holeIndex === holeIndex && m.phase === 'up',
    );
    if (moleIdx === -1) return state; // miss (no tappable mole)
    const mole = state.moles[moleIdx]!;
    // Mark as retracting + hit.
    state.moles[moleIdx] = { ...mole, phase: 'retracting', hit: true };

    if (mole.kind === 'monkey') {
      const fresh = timingFraction(mole);
      const f = fresh < 0 ? 0 : fresh > 1 ? 1 : fresh;
      const award = BASE_SCORE + Math.round(TIMING_BONUS_MAX * f);
      // Reaction-time gate: a tap landing too soon after the mole rose is
      // superhuman (a frame-perfect offline solver). The mole is consumed but
      // does NOT score, so such a round never reaches passHits. A real
      // player's reaction is far above the floor, so live play is unaffected.
      if (isHumanReaction(mole.appearTick, state.tick, REACTION_TICKS)) {
        state.goodHits += 1;
        state.score += award;
        state.hitsInLevel += 1;
        pushFx(state, { kind: 'whack', holeIndex, delta: award });
        if (!state.verified && state.goodHits >= state.cfg.passHits) {
          state.verified = 1;
        }
      }
      // Level-up check.
      const ladder = buildLadder(state.cfg);
      if (
        state.levelIndex < LEVEL_COUNT - 1 &&
        state.hitsInLevel >= ladder[state.levelIndex]!.goal
      ) {
        state.levelIndex += 1;
        state.hitsInLevel = 0;
        pushFx(state, { kind: 'level', holeIndex, delta: state.levelIndex + 1 });
        // Re-pick interval immediately at the new rate.
        const r = rngFromState(state.rng);
        state.interval = pickInterval(() => r.next(), ladder[state.levelIndex]!.spawnRate);
        state.rng = r.state;
      }
    } else {
      // Decoy tap: dock score + burn clock.
      state.score = Math.max(0, state.score - DECOY_PENALTY);
      state.timeLeft = Math.max(0, state.timeLeft - DECOY_TIME_PENALTY_S);
      pushFx(state, { kind: 'decoy', holeIndex, delta: -DECOY_PENALTY });
    }
    return state;
  },

  tick(state) {
    state.tick += 1;
    // Advance the clock. (fx is cleared by the DRIVER before applying actions;
    // the server replay never reads fx so we leave it as-is there.)
    state.timeLeft = Math.max(0, state.timeLeft - STEP_S);
    if (state.timeLeft <= 0) return state; // round over; no more spawning

    const r = rngFromState(state.rng);
    const next = (): number => r.next();

    // Advance hole cooldowns.
    for (let i = 0; i < HOLE_COUNT; i++) {
      if (state.holeCooldowns[i]! > 0) {
        state.holeCooldowns[i] = Math.max(0, state.holeCooldowns[i]! - STEP_S);
      }
    }

    // Step every live mole.
    const survivors: SimMole[] = [];
    for (const m of state.moles) {
      const next2 = stepMole(m, STEP_S);
      if (next2.phase !== 'dead') survivors.push(next2);
    }
    state.moles = survivors;

    // Spawn due moles (while loop so a single tick can't owe more than one emit;
    // the caps bound it).
    const ladder = buildLadder(state.cfg);
    const lvl = ladder[state.levelIndex]!;
    state.spawnTimer += STEP_S;
    while (state.spawnTimer >= state.interval) {
      state.spawnTimer -= state.interval;
      state.interval = pickInterval(next, lvl.spawnRate);

      // Decide kind.
      let kind: SimMole['kind'] = next() < lvl.decoyChance ? 'decoy' : 'monkey';
      const goodFull = countUp(state.moles, 'monkey') >= MAX_CONCURRENT;
      const decoyFull = countUp(state.moles, 'decoy') >= MAX_CONCURRENT_DECOY;
      if (kind === 'monkey' && goodFull) kind = 'decoy';
      if (kind === 'decoy' && decoyFull) kind = 'monkey';
      if ((kind === 'monkey' && goodFull) || (kind === 'decoy' && decoyFull)) continue;

      // Eligible holes: no mole, off cooldown, prefer not last used.
      const occ = new Set(state.moles.map((m) => m.holeIndex));
      const eligible: number[] = [];
      for (let i = 0; i < HOLE_COUNT; i++) {
        if (!occ.has(i) && state.holeCooldowns[i]! <= 0) eligible.push(i);
      }
      if (eligible.length === 0) continue;
      const spread = eligible.filter((i) => i !== state.lastHole);
      const pool = spread.length > 0 ? spread : eligible;
      const holeIndex = pool[Math.floor(next() * pool.length)]!;

      state.moles.push({
        id: state.nextId++,
        holeIndex,
        kind,
        phase: 'up',
        age: 0,
        uptimeS: lvl.uptimeS,
        scaleY: 0,
        scaleVel: EMERGE_INIT_VEL,
        hit: false,
        // Stamp the tick this mole rose to 'up' (actionable). Read at tap
        // time by the reaction-time gate.
        appearTick: state.tick,
      });
      state.holeCooldowns[holeIndex] = HOLE_COOLDOWN_FACTOR * state.interval;
      state.lastHole = holeIndex;
    }

    state.rng = r.state;
    return state;
  },

  isOver(state) {
    return state.timeLeft <= 0;
  },

  result(state) {
    // Engine owns the pass decision: `verified` latches (in step) once goodHits
    // reaches cfg.passHits. score = good monkeys whacked.
    return { score: state.goodHits, passed: state.verified === 1 };
  },

  view(state) {
    return {
      moles: state.moles,
      goodHits: state.goodHits,
      score: state.score,
      timeLeft: state.timeLeft,
      levelIndex: state.levelIndex,
      verified: state.verified,
      fx: state.fx,
    };
  },
});
