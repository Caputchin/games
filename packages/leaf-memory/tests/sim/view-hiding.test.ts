import { describe, it, expect } from 'vitest';
import { engine } from '../../src/sim/engine.js';
import type { Seed } from '@caputchin/replay-contract';
import type { SimState } from '../../src/sim/types.js';

const SEED: Seed = [0x1, 0x2, 0x3, 0x4];

// The view() projection must not leak face-down leaf identities (the whole point
// of a memory game). It reveals a kind ONLY for a card that is matched or one of
// the two live picks. This kills the cheap view()-reader attack (a bot reading
// engine.view().cards[].kind to match pairs without remembering).
describe('view() hides face-down leaf kinds', () => {
  it('reveals no kinds on a fresh board', () => {
    const s = engine.init({ seed: SEED, config: null });
    const v = engine.view!(s);
    expect(v.cards.length).toBeGreaterThan(0);
    expect(v.cards.every((c) => c.kind === null)).toBe(true);
    expect(v.cards.every((c) => c.matched === false)).toBe(true);
  });

  it('reveals only the live pick after one flip, hiding the rest', () => {
    let s = engine.init({ seed: SEED, config: null });
    s = engine.step(s, { cardIndex: 0 });
    const v = engine.view!(s);
    expect(v.cards[0]!.kind).not.toBeNull(); // the flipped card is revealed
    for (let i = 1; i < v.cards.length; i++) {
      if (!v.cards[i]!.matched && i !== v.firstPick && i !== v.secondPick) {
        expect(v.cards[i]!.kind).toBeNull();
      }
    }
  });

  it('reveals both cards of a matched pair', () => {
    let s = engine.init({ seed: SEED, config: null });
    // Find a matching pair from the privileged engine STATE (tests may peek).
    const k = s.cards[0]!.kind;
    const j = s.cards.findIndex((c, i) => i !== 0 && c.kind === k);
    s = engine.step(s, { cardIndex: 0 });
    s = engine.step(s, { cardIndex: j });
    const v = engine.view!(s);
    expect(v.cards[0]!.matched).toBe(true);
    expect(v.cards[0]!.kind).toBe(k);
    expect(v.cards[j]!.kind).toBe(k);
  });
});

// U1 contract lock (game-captcha-constitution rule U1: "expose no latent state
// in view()"). The view-hiding tests above prove the *behaviour*; these two
// freeze the *contract* so a future edit that adds a leaky field to view() — or
// that drops the face-down null-out — turns red instead of silently shipping
// the answer to the client. This is the static U1 verify ("diff view() against
// what the renderer draws") encoded as a test.
describe('view() U1 contract: no answer field the frame does not draw', () => {
  it('exposes exactly the allowed view + card key set (freeze the projection)', () => {
    const s = engine.init({ seed: SEED, config: null });
    const v = engine.view!(s);
    // Every key below is consumed by the live renderer (game.ts): the board
    // sync reads cards/firstPick/secondPick/matched, the HUD reads
    // ticksElapsed/budgetTicks/matchCount/pairs, and allMatched/timedOut drive
    // the win/loss transition. A NEW key here is a new field the offline solver
    // reads — add it to this list only after confirming the frame draws it.
    expect(Object.keys(v).sort()).toEqual(
      [
        'allMatched',
        'budgetTicks',
        'cards',
        'firstPick',
        'flipBackTicks',
        'matchCount',
        'pairs',
        'secondPick',
        'ticksElapsed',
        'timedOut',
      ].sort(),
    );
    // A card projects only its draw state: the leaf kind (null while face-down)
    // and the matched flag. No board index, no twin pointer, nothing latent.
    expect(Object.keys(v.cards[0]!).sort()).toEqual(['kind', 'matched'].sort());
  });

  it('never reveals a face-down card kind at any tick of a full play', () => {
    let s: SimState = engine.init({ seed: SEED, config: null });

    // Build a heap-informed winning pick order (the test may peek STATE to know
    // the deck), then drive the whole round one pick per tick. The point is not
    // the win — it is asserting the view invariant after every transition.
    const byKind = new Map<number, number[]>();
    s.cards.forEach((c, idx) => {
      const a = byKind.get(c.kind) ?? [];
      a.push(idx);
      byKind.set(c.kind, a);
    });
    const order: number[] = [];
    for (const idxs of byKind.values()) order.push(...idxs);

    const assertNoFaceDownLeak = (state: SimState): void => {
      const v = engine.view!(state);
      v.cards.forEach((c, i) => {
        const faceUp = c.matched || i === v.firstPick || i === v.secondPick;
        if (!faceUp) expect(c.kind, `face-down card ${i} leaked its kind`).toBeNull();
      });
    };

    assertNoFaceDownLeak(s);
    for (const cardIndex of order) {
      s = engine.step(s, { cardIndex });
      assertNoFaceDownLeak(s);
      s = engine.tick(s);
      assertNoFaceDownLeak(s);
    }
  });
});
