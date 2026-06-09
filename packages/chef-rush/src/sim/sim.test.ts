// Gate tests for the Chef Rush sim, driven through a mock api (no engine), so each
// constitution rule is asserted directly: R1 (reaction floor), R2 (wrong/rotten
// chop costs a life), U6 (genuine-chop span), U2 (pass latch), plus a correct chop.

import { describe, expect, it } from 'vitest';
import { createChefSim } from './sim';
import type { ChefConfig, SimView } from './types';
import { MIN_CHOP_SPAN, SLOTS } from './constants';
import type { ExcaliburGameApi } from '@caputchin/preset-excalibur';

interface PointerEv {
  kind: 0 | 1 | 2;
  x: number;
  y: number;
}

function makeApi(opts: { randi?: (n: number) => number; chance?: (p: number) => boolean } = {}) {
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
    randi: opts.randi ?? ((_n: number) => 0),
    randiRange: (min: number) => min,
    chance: opts.chance ?? (() => false),
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
  ingredientWindowTicks: 300,
  distractorChance: 0,
  recipeSize: 1,
  timeBudgetTicks: 2000,
  ...over,
});

/** A horizontal swipe across slot `k` (span 120 >= MIN, crosses the disc). */
function chop(k: number): PointerEv[] {
  const s = SLOTS[k]!;
  return [
    { kind: 0, x: s.x - 60, y: s.y },
    { kind: 1, x: s.x + 60, y: s.y },
  ];
}

/** Run ticks 0..gestureTick-1 empty (spawns fill slots), then the chop. */
function play(cfg: ChefConfig, opts: Parameters<typeof makeApi>[0], gestureTick: number, evs: PointerEv[]) {
  const h = makeApi(opts);
  const sim = createChefSim(h.api, cfg);
  for (let t = 0; t < gestureTick; t++) {
    h.step(t, []);
    sim.tick();
  }
  h.step(gestureTick, evs);
  sim.tick();
  return { h, sim };
}

describe('Chef Rush gates', () => {
  it('chops a needed ingredient, completes the order, and latches the pass (U2)', () => {
    // randi=>0 -> recipe [tomato]; spawns are needed tomatoes (distractorChance 0).
    const { h } = play(baseCfg(), {}, 8, chop(0));
    expect(h.out.score).toBe(1);
    expect(h.out.passed).toBe(true);
    expect(h.out.over).toBe(true);
  });

  it('R1: a too-fast chop does not fill the order', () => {
    const { h, sim } = play(baseCfg({ passScore: 2 }), {}, 3, chop(0));
    expect(h.out.score).toBe(0);
    expect(h.out.passed).toBe(false);
    const v: SimView = sim.view();
    // the ingredient was consumed (chopped) but the order slot stays unfilled
    expect(v.order?.filled.every((f) => f === 0)).toBe(true);
  });

  it('R2: chopping a rotten ingredient costs a life', () => {
    // chance=>true -> every spawn is a rotten distractor.
    const { h } = play(baseCfg({ lives: 1 }), { chance: () => true }, 8, chop(0));
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });

  it('R2: chopping a wrong (off-recipe) ingredient costs a life', () => {
    // distractor check (p<0.5) true, rotten check (p===0.5) false -> wrong-type fresh.
    const { h } = play(baseCfg({ lives: 1 }), { chance: (p) => p < 0.5 }, 8, chop(0));
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });

  it('U6: a sub-span chop does not register', () => {
    const s = SLOTS[0]!;
    const tiny: PointerEv[] = [
      { kind: 0, x: s.x, y: s.y },
      { kind: 1, x: s.x + (MIN_CHOP_SPAN - 12), y: s.y },
    ];
    const { h, sim } = play(baseCfg({ passScore: 2 }), {}, 8, tiny);
    expect(h.out.score).toBe(0);
    const v = sim.view();
    expect(v.ingredients.some((g) => g.slot === 0 && g.done === 0)).toBe(true);
  });

  it('loses a life when a needed ingredient slips by unchopped', () => {
    const cfg = baseCfg({ passScore: 9, ingredientWindowTicks: 8, lives: 1 });
    const h = makeApi({});
    const sim = createChefSim(h.api, cfg);
    for (let t = 0; t < 40 && !h.out.over; t++) {
      h.step(t, []);
      sim.tick();
    }
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });
});
