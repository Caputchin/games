// Gate tests for the Chef Rush sim, driven through a mock api (no engine), so each
// constitution rule is asserted directly: R1 (reaction floor), R2 (wrong/rotten
// cook costs a life), U6 (genuine-gesture span), U2 (pass latch), plus a correct
// cook - and a unit test of the gesture classifier (chop / stir / flip).

import { describe, expect, it } from 'vitest';
import { createChefSim } from './sim';
import { classifyGesture } from './gestures';
import type { ChefConfig, SimView, Stroke } from './types';
import { MIN_GESTURE_SPAN, STATIONS } from './constants';
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
  itemWindowTicks: 300,
  distractorChance: 0,
  recipeSize: 1,
  timeBudgetTicks: 2000,
  ...over,
});

/** A downward slash anchored on station `k` (the chop gesture; span >= MIN). */
function chop(k: number): PointerEv[] {
  const s = STATIONS[k]!;
  return [
    { kind: 0, x: s.x, y: s.y - 30 },
    { kind: 2, x: s.x, y: s.y + 40 },
  ];
}

/** Run ticks 0..gestureTick-1 empty (spawns fill stations), then the gesture. */
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
  it('cooks a needed ingredient, completes the order, and latches the pass (U2)', () => {
    // randi=>0 -> recipe [tomato @ board]; spawns are needed tomatoes (no distractor).
    const { h } = play(baseCfg(), {}, 10, chop(0));
    expect(h.out.score).toBe(1);
    expect(h.out.passed).toBe(true);
    expect(h.out.over).toBe(true);
  });

  it('R1: a too-fast gesture does not fill the order', () => {
    const { h, sim } = play(baseCfg({ passScore: 2 }), {}, 3, chop(0));
    expect(h.out.score).toBe(0);
    expect(h.out.passed).toBe(false);
    // the ingredient was consumed but the order slot stays unfilled
    const v: SimView = sim.view();
    expect(v.order?.filled.every((f) => f === 0)).toBe(true);
  });

  it('R2: cooking a rotten ingredient costs a life', () => {
    // chance=>true -> every spawn is a rotten distractor (at the board).
    const { h } = play(baseCfg({ lives: 1 }), { chance: () => true }, 10, chop(0));
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });

  it('R2: cooking a wrong (off-recipe) ingredient costs a life', () => {
    // distractor check (p<0.5) true, rotten check (p===0.5) false -> wrong-type fresh.
    const { h } = play(baseCfg({ lives: 1 }), { chance: (p) => p < 0.5 }, 10, chop(0));
    expect(h.out.over).toBe(true);
    expect(h.out.passed).toBe(false);
  });

  it('U6: a sub-span gesture does not register', () => {
    const s = STATIONS[0]!;
    const tiny: PointerEv[] = [
      { kind: 0, x: s.x, y: s.y },
      { kind: 2, x: s.x, y: s.y + (MIN_GESTURE_SPAN - 12) },
    ];
    const { h, sim } = play(baseCfg({ passScore: 2 }), {}, 10, tiny);
    expect(h.out.score).toBe(0);
    const v = sim.view();
    expect(v.items.some((it) => it.station === 0 && it.done === 0)).toBe(true);
  });

  it('loses a life when a needed ingredient spoils unworked', () => {
    const cfg = baseCfg({ passScore: 9, itemWindowTicks: 8, lives: 1 });
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

describe('gesture classifier', () => {
  const mk = (pts: Array<[number, number]>): Stroke => {
    const [a, ...rest] = pts;
    const s: Stroke = {
      active: false,
      anchorX: a![0],
      anchorY: a![1],
      lastX: a![0],
      lastY: a![1],
      minX: a![0],
      maxX: a![0],
      minY: a![1],
      maxY: a![1],
      pathLen: 0,
    };
    for (const [x, y] of rest) {
      s.pathLen += Math.max(Math.abs(x - s.lastX), Math.abs(y - s.lastY));
      s.lastX = x;
      s.lastY = y;
      s.minX = Math.min(s.minX, x);
      s.maxX = Math.max(s.maxX, x);
      s.minY = Math.min(s.minY, y);
      s.maxY = Math.max(s.maxY, y);
    }
    return s;
  };

  it('classifies a downward slash as chop (0)', () => {
    expect(classifyGesture(mk([[400, 380], [402, 470]]))).toBe(0);
  });

  it('classifies an upward flick as flip (2)', () => {
    expect(classifyGesture(mk([[400, 470], [398, 380]]))).toBe(2);
  });

  it('classifies a loop as stir (1)', () => {
    expect(
      classifyGesture(mk([[400, 432], [450, 432], [450, 482], [400, 482], [400, 432]])),
    ).toBe(1);
  });

  it('rejects a sub-span nick (-1)', () => {
    expect(classifyGesture(mk([[400, 432], [410, 444]]))).toBe(-1);
  });

  it('rejects a sideways swipe (-1)', () => {
    expect(classifyGesture(mk([[360, 432], [460, 430]]))).toBe(-1);
  });
});
