// Gate tests for the Chef Rush sim, driven through a mock api (no engine), so each
// constitution rule is asserted directly: a correct drag+cook (U2), R1 (reaction
// floor), R2 (wrong/rotten cook, wrong station, trashing a needed item all cost a
// life; correctly trashing a distractor does not), U6 (genuine-gesture span), plus a
// spoil; and a unit test of the gesture classifier (chop / stir / flip).

import { describe, expect, it } from 'vitest';
import { createChefSim } from './sim';
import { classifyGesture, type Stroke } from './gestures';
import { GAME_LOST, GAME_PLAYING, GAME_WAITING, type ChefConfig } from './types';
import { MIN_GESTURE_SPAN, overlayButtonRect, PREP, STATIONS, TRASH } from './constants';
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
  itemWindowTicks: 400,
  distractorChance: 0,
  recipeSize: 1,
  timeBudgetTicks: 4000,
  ...over,
});

/** A drag of the prep item to a station / the trash. */
function dragTo(x: number, y: number): PointerEv[] {
  return [
    { kind: 0, x: PREP.x, y: PREP.y },
    { kind: 1, x: (PREP.x + x) / 2, y: (PREP.y + y) / 2 },
    { kind: 2, x, y },
  ];
}
const dragToStation = (s: number): PointerEv[] => dragTo(STATIONS[s]!.x, STATIONS[s]!.y);
const dragToTrash = (): PointerEv[] => dragTo(TRASH.x, TRASH.y);

/** A chop gesture (down slash) anchored at station `s`. */
function chopAt(s: number): PointerEv[] {
  const c = STATIONS[s]!;
  return [
    { kind: 0, x: c.x, y: c.y - 30 },
    { kind: 2, x: c.x, y: c.y + 40 },
  ];
}

/** A tap on the start button (the game waits for one before anything spawns). */
const startBtn = overlayButtonRect(GAME_WAITING);
const START: PointerEv = { kind: 0, x: startBtn.x + startBtn.w / 2, y: startBtn.y + startBtn.h / 2 };

/** Drive the sim across ticks 0..maxTick, applying `plan`'s events at their ticks.
 *  Injects the start tap at tick 0 so the round is playing from the first tick. */
function drive(cfg: ChefConfig, opts: Parameters<typeof makeApi>[0], plan: Map<number, PointerEv[]>, maxTick: number) {
  const h = makeApi(opts);
  const sim = createChefSim(h.api, cfg);
  for (let t = 0; t <= maxTick && !h.out.over; t++) {
    const evs = plan.get(t) ?? [];
    h.step(t, t === 0 ? [START, ...evs] : evs);
    sim.tick();
  }
  return { h, sim };
}

describe('Chef Rush gates', () => {
  it('drags a needed ingredient to its station, cooks it, serves, and passes (U2)', () => {
    // randi=>0 -> recipe [tomato @ board]; the first item is that tomato.
    const plan = new Map([[3, dragToStation(0)], [12, chopAt(0)]]);
    const { h } = drive(baseCfg(), {}, plan, 24);
    expect(h.out.score).toBe(1);
    expect(h.out.passed).toBe(true);
    expect(h.out.over).toBe(true);
  });

  it('R1: a too-fast cook does not fill the order', () => {
    const plan = new Map([[1, dragToStation(0)], [4, chopAt(0)]]); // 4 - 0 < REACTION_TICKS
    const { h, sim } = drive(baseCfg({ passScore: 2 }), {}, plan, 10);
    expect(h.out.score).toBe(0);
    expect(h.out.passed).toBe(false);
    expect(sim.view().order?.filled.every((f) => f === 0)).toBe(true);
  });

  it('R2: cooking a rotten ingredient costs a life', () => {
    // chance=>true -> the first item is a rotten distractor.
    const plan = new Map([[3, dragToStation(0)]]);
    const { sim } = drive(baseCfg({ lives: 1 }), { chance: () => true }, plan, 10);
    expect(sim.view().gamePhase).toBe(GAME_LOST);
  });

  it('R2: dropping a needed ingredient at the wrong station costs a life', () => {
    // tomato belongs at the board (0); drop it at the pan (2).
    const plan = new Map([[3, dragToStation(2)]]);
    const { sim } = drive(baseCfg({ lives: 1 }), {}, plan, 10);
    expect(sim.view().gamePhase).toBe(GAME_LOST);
  });

  it('R2: trashing a needed ingredient costs a life', () => {
    const plan = new Map([[3, dragToTrash()]]);
    const { sim } = drive(baseCfg({ lives: 1 }), {}, plan, 10);
    expect(sim.view().gamePhase).toBe(GAME_LOST);
  });

  it('correctly trashing a wrong ingredient costs no life', () => {
    // chance=(p)=>p<0.5 -> the first item is a wrong-type fresh distractor (carrot).
    const plan = new Map([[3, dragToTrash()]]);
    const { sim } = drive(baseCfg({ lives: 3 }), { chance: (p) => p < 0.5 }, plan, 10);
    expect(sim.view().lives).toBe(3);
    expect(sim.view().gamePhase).toBe(GAME_PLAYING);
  });

  it('U6: a sub-span gesture does not cook the placed item', () => {
    const c = STATIONS[0]!;
    const tiny: PointerEv[] = [
      { kind: 0, x: c.x, y: c.y },
      { kind: 2, x: c.x, y: c.y + (MIN_GESTURE_SPAN - 12) },
    ];
    const plan = new Map([[2, dragToStation(0)], [12, tiny]]);
    const { h, sim } = drive(baseCfg({ passScore: 2 }), {}, plan, 16);
    expect(h.out.score).toBe(0);
    expect(sim.view().item?.phase).toBe(1); // still placed at the station, uncooked
  });

  it('loses a life when a needed ingredient spoils unworked', () => {
    const { sim } = drive(baseCfg({ passScore: 9, itemWindowTicks: 8, lives: 1 }), {}, new Map(), 30);
    expect(sim.view().gamePhase).toBe(GAME_LOST);
  });

  it('waits for a start tap before anything spawns (no RNG drawn until then)', () => {
    const h = makeApi({});
    const sim = createChefSim(h.api, baseCfg());
    for (let t = 0; t < 20; t++) {
      h.step(t, []);
      sim.tick();
    }
    expect(sim.view().gamePhase).toBe(GAME_WAITING);
    expect(sim.view().item).toBeNull();
    h.step(20, [START]);
    sim.tick();
    expect(sim.view().gamePhase).toBe(GAME_PLAYING);
    expect(sim.view().item).not.toBeNull();
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
    expect(classifyGesture(mk([[400, 432], [450, 432], [450, 482], [400, 482], [400, 432]]))).toBe(1);
  });
  it('rejects a sub-span nick (-1)', () => {
    expect(classifyGesture(mk([[400, 432], [410, 444]]))).toBe(-1);
  });
});
