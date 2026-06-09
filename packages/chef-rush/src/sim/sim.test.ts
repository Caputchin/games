// Gate tests for the Chef Rush sim, driven through a mock api (no engine), so each
// constitution rule is asserted directly: R1 (reaction floor), R2 (spoiled fatal),
// U6 (genuine-gesture span), U2 (pass latch), plus a correct serve.

import { describe, expect, it } from 'vitest';
import { createChefSim } from './sim';
import type { ChefConfig, SimView } from './types';
import { MIN_GESTURE_SPAN, STATIONS } from './constants';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';

interface PointerEv {
  kind: 0 | 1 | 2;
  x: number;
  y: number;
}

function makeApi(spoiled: boolean) {
  let tick = 0;
  let events: PointerEv[] = [];
  const out = { score: 0, passed: false, over: false };
  const api = {
    get tick() {
      return tick;
    },
    pointer: { isDown: false, x: 0, y: 0, get events() { return events; } },
    isDown: () => false,
    justPressed: () => false,
    justReleased: () => false,
    rand: () => 0,
    // randi -> 0: spawn always picks the first free station, direction UP.
    randi: (_n: number) => 0,
    randiRange: (min: number) => min,
    chance: () => spoiled,
    choose: <T>(arr: readonly T[]) => arr[0]!,
    setScore: (s: number) => {
      out.score = s;
    },
    pass: () => {
      out.passed = true;
    },
    gameOver: () => {
      out.over = true;
    },
    announce: () => {},
    onTick: () => {},
    press: () => {},
    release: () => {},
    ctx: null,
    headless: true,
  } as unknown as ExcaliburGameApi;
  return {
    api,
    out,
    step(t: number, evs: PointerEv[] = []): void {
      tick = t;
      events = evs;
    },
  };
}

const baseCfg = (over: Partial<ChefConfig> = {}): ChefConfig => ({
  passScore: 1,
  lives: 3,
  spawnIntervalTicks: 1,
  gestureWindowTicks: 200,
  spoiledChance: 0,
  timeBudgetTicks: 1000,
  ...over,
});

// Station 0 centre; an UP gesture spans well past MIN_GESTURE_SPAN.
const S0 = STATIONS[0]!;
const downS0: PointerEv = { kind: 0, x: S0.x, y: S0.y };
const upGesture: PointerEv = { kind: 1, x: S0.x, y: S0.y - (MIN_GESTURE_SPAN + 20) };

/** Run ticks 0..(gestureTick-1) with no input (spawns fill stations), then the
 *  gesture at gestureTick. Returns the harness. */
function play(spoiled: boolean, cfg: ChefConfig, gestureTick: number, gesture: PointerEv[]) {
  const h = makeApi(spoiled);
  const sim = createChefSim(h.api, cfg);
  for (let t = 0; t < gestureTick; t++) {
    h.step(t, []);
    sim.tick();
  }
  h.step(gestureTick, gesture);
  sim.tick();
  return { h, sim };
}

describe('Chef Rush gates', () => {
  it('serves a correct gesture and latches the pass (U2)', () => {
    const { h } = play(false, baseCfg(), 8, [downS0, upGesture]);
    expect(h.out.score).toBe(1);
    expect(h.out.passed).toBe(true);
    expect(h.out.over).toBe(true);
  });

  it('R1: a too-fast gesture is consumed but does not score', () => {
    // Gesture at tick 3 - fewer than REACTION_TICKS (5) after the prompt appeared.
    const { h, sim } = play(false, baseCfg({ passScore: 2 }), 3, [downS0, upGesture]);
    expect(h.out.score).toBe(0);
    expect(h.out.passed).toBe(false);
    // The prompt was consumed (served), so station 0 is now free.
    const v: SimView = sim.view();
    expect(v.prompts.some((p) => p.station === 0)).toBe(false);
  });

  it('R2: gesturing a spoiled prompt is fatal', () => {
    const { h } = play(true, baseCfg(), 8, [downS0, upGesture]);
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
    expect(h.out.score).toBe(0);
  });

  it('U6: a sub-span gesture does not register (no serve, prompt remains)', () => {
    const tinyMove: PointerEv = { kind: 1, x: S0.x, y: S0.y - (MIN_GESTURE_SPAN - 10) };
    const { h, sim } = play(false, baseCfg({ passScore: 2 }), 8, [downS0, tinyMove]);
    expect(h.out.score).toBe(0);
    expect(h.out.passed).toBe(false);
    const v = sim.view();
    expect(v.prompts.some((p) => p.station === 0 && p.served === 0)).toBe(true);
  });

  it('a wrong-direction gesture does not serve a good prompt', () => {
    // Prompt dir is UP (randi -> 0); gesture DOWN.
    const downMove: PointerEv = { kind: 1, x: S0.x, y: S0.y + (MIN_GESTURE_SPAN + 20) };
    const { h, sim } = play(false, baseCfg({ passScore: 2 }), 8, [downS0, downMove]);
    expect(h.out.score).toBe(0);
    const v = sim.view();
    // Still present (wrong gesture doesn't consume the prompt's slot via serve).
    expect(v.prompts.some((p) => p.station === 0 && p.served === 0)).toBe(true);
  });

  it('loses a life when a good prompt expires unserved', () => {
    const cfg = baseCfg({ passScore: 5, gestureWindowTicks: 10, lives: 1 });
    const h = makeApi(false);
    const sim = createChefSim(h.api, cfg);
    // Run past the first prompt's expiry with no input -> miss -> life 0 -> over.
    for (let t = 0; t < 30 && !h.out.over; t++) {
      h.step(t, []);
      sim.tick();
    }
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });
});
