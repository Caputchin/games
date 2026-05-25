// Tiny seedable PRNG (mulberry32). Used so spawn / hole selection is
// deterministic in unit tests; game.ts seeds it from Date.now() at runtime for
// variety.

export type Rng = () => number;

/** Returns a deterministic `() => [0, 1)` generator for the given seed. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
