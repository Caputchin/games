import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace, reactionFloorTicks } from '@caputchin/engine-kit';
import type { Seed } from '@caputchin/replay-contract';
import { engine } from '../src/sim/engine.js';
import { GOOD } from '../src/sim/types.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
// null = no dashboard override; the engine resolves it to the manifest defaults
// internally. Tests never build a SimConfig.
const CFG: Record<string, unknown> | null = null;
const MAX = 6000;

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { sliceMargin: 3, maxTicks: MAX });
    // Same strategy, different fruit pattern -> the recorded action stream differs.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
    // The driver stopped slicing past the threshold, so the round ended on lives.
    expect(live.lives).toBe(0);
    // The engine owns the pass decision; slicing past the gate latched verified.
    expect(out.passed).toBe(true);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when enough good fruit are sliced', () => {
    const live = play(SEED, CFG, { sliceMargin: 2, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream loses (no slices) and terminates', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false); // fruit escape, lives drain, round ends
    expect(out.passed).toBe(false);
  });
});

describe('reaction-time gate', () => {
  it('a frame-perfect bot (zero reaction delay) scores nothing and fails', () => {
    // Slices every good fruit the instant it is sliceable -> every slice is
    // superhuman -> the gate refuses to count any of them.
    const bot = play(SEED, CFG, { sliceMargin: 2, maxTicks: MAX, reactionDelay: 0 });
    expect(bot.recorded.length).toBeGreaterThan(0); // it DID act
    expect(bot.score).toBe(0); // ...but nothing counted
    const out = replay(engine, { seed: SEED, config: CFG, actions: bot.recorded, maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.passed).toBe(false);
  });

  it('a human-paced player (reaction above the floor) scores and passes', () => {
    const human = play(SEED, CFG, {
      sliceMargin: 2,
      maxTicks: MAX,
      reactionDelay: reactionFloorTicks() + 2,
    });
    expect(human.score).toBeGreaterThan(0);
    const out = replay(engine, { seed: SEED, config: CFG, actions: human.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});

describe('bomb = instant loss (scatter-bot guard)', () => {
  it('slicing a single bomb ends the round, even with lives to spare', () => {
    // Run with bombs guaranteed (hazard 1: every launch is a bomb) and start
    // with a full lives buffer; one bomb slice must zero lives and end it.
    const cfg = { hazard_chance: 1, lives: 6 };
    let state = engine.init({ seed: SEED, config: cfg });
    // Advance until a bomb has cleared the reaction floor (so the slice lands).
    let bomb: { x: number; y: number; spawnTick: number } | undefined;
    for (let t = 0; t < MAX; t++) {
      state = engine.tick(state);
      bomb = state.targets.find(
        (b) => b.kind !== GOOD && state.tick - b.spawnTick >= reactionFloorTicks() + 1,
      );
      if (bomb) break;
    }
    expect(bomb).toBeDefined();
    // Swipe across the bomb (down beside it, move through, up).
    state = engine.step(state, { k: 0, x: bomb!.x - 60, y: bomb!.y });
    state = engine.step(state, { k: 1, x: bomb!.x + 60, y: bomb!.y });
    state = engine.step(state, { k: 2 });
    expect(engine.view!(state).lives).toBe(0);
    expect(engine.isOver(state)).toBe(true);
  });
});

describe('genuine-swipe gate (U6 path-channel)', () => {
  // Advance a default round until one good fruit has cleared the reaction floor,
  // so a landing slice would otherwise score. Returns that fruit + the state.
  function aRipeFruit() {
    let state = engine.init({ seed: SEED, config: { hazard_chance: 0 } });
    let fruit: { id: number; x: number; y: number } | undefined;
    for (let t = 0; t < MAX; t++) {
      state = engine.tick(state);
      fruit = state.targets.find(
        (f) => f.kind === GOOD && !f.sliced && state.tick - f.spawnTick >= reactionFloorTicks() + 1,
      );
      if (fruit) break;
    }
    expect(fruit).toBeDefined();
    return { state, fruit: fruit! };
  }

  it('a 1px point-nick at the fruit centre does NOT slice (the tap-dodge is closed)', () => {
    let { state, fruit } = aRipeFruit();
    state = engine.step(state, { k: 0, x: fruit.x, y: fruit.y });
    state = engine.step(state, { k: 1, x: fruit.x + 1, y: fruit.y });
    state = engine.step(state, { k: 2 });
    // Consumed nothing: the fruit is still live and the score is untouched.
    expect(engine.view!(state).sliced).toBe(0);
    expect(state.targets.find((t) => t.id === fruit.id)?.sliced).toBe(0);
  });

  it('a genuine swipe across the fruit slices and scores', () => {
    let { state, fruit } = aRipeFruit();
    state = engine.step(state, { k: 0, x: fruit.x - 30, y: fruit.y });
    state = engine.step(state, { k: 1, x: fruit.x + 30, y: fruit.y });
    state = engine.step(state, { k: 2 });
    expect(engine.view!(state).sliced).toBe(1);
  });

  it('two separate sub-span edge-taps cannot combine into a fake swipe', () => {
    let { state, fruit } = aRipeFruit();
    // Tap the left edge (its own short down-stroke), release, then tap the right
    // edge. The points span > MIN_SLICE_SPAN apart, but each stroke is tiny and
    // the pointer-down resets the anchor, so neither stroke earns the slice.
    state = engine.step(state, { k: 0, x: fruit.x - 20, y: fruit.y });
    state = engine.step(state, { k: 1, x: fruit.x - 19, y: fruit.y });
    state = engine.step(state, { k: 2 });
    state = engine.step(state, { k: 0, x: fruit.x + 19, y: fruit.y });
    state = engine.step(state, { k: 1, x: fruit.x + 20, y: fruit.y });
    state = engine.step(state, { k: 2 });
    expect(engine.view!(state).sliced).toBe(0);
  });

  it('a slow many-sample swipe accumulates span across the stroke and slices', () => {
    // High-sample-rate humans emit many short move segments; the per-stroke
    // anchor accumulates displacement across them, so a slow swipe still lands
    // (no per-segment length floor that would false-reject fine sampling).
    let { state, fruit } = aRipeFruit();
    state = engine.step(state, { k: 0, x: fruit.x - 16, y: fruit.y });
    for (let i = -16; i <= 16; i += 2) {
      state = engine.step(state, { k: 1, x: fruit.x + i, y: fruit.y });
    }
    state = engine.step(state, { k: 2 });
    expect(engine.view!(state).sliced).toBe(1);
  });
});
