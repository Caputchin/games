import { describe, it, expect } from 'vitest';
import { engine } from '../../src/sim/engine.js';
import type { Seed } from '@caputchin/replay-contract';

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
