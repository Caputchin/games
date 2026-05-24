import { describe, it, expect } from 'vitest';
import { Horizon } from '../src/horizon.js';
import { WORLD_WIDTH, MAX_CLOUDS } from '../src/constants.js';

describe('Horizon ground', () => {
  it('scrolls left and wraps within (-WORLD_WIDTH, 0]', () => {
    const h = new Horizon(() => 0.5);
    for (let i = 0; i < 200; i += 1) h.update(16, 12, false);
    expect(h.groundX).toBeGreaterThan(-WORLD_WIDTH);
    expect(h.groundX).toBeLessThanOrEqual(0);
  });

  it('keeps scrolling the ground even under reduced motion', () => {
    const h = new Horizon(() => 0.5);
    const before = h.groundX;
    h.update(16, 10, true);
    expect(h.groundX).toBeLessThan(before);
  });
});

describe('Horizon clouds', () => {
  it('spawns clouds up to the cap', () => {
    const h = new Horizon(() => 0.1);
    for (let i = 0; i < 5000; i += 1) h.update(16, 12, false);
    expect(h.clouds.length).toBeGreaterThan(0);
    expect(h.clouds.length).toBeLessThanOrEqual(MAX_CLOUDS);
  });

  it('freezes decorative drift under reduced motion', () => {
    const h = new Horizon(() => 0.5);
    const moonX = h.moon.x;
    const starX = h.stars[0]!.x;
    for (let i = 0; i < 50; i += 1) h.update(16, 10, true);
    expect(h.moon.x).toBe(moonX);
    expect(h.stars[0]!.x).toBe(starX);
    expect(h.clouds.length).toBe(0);
  });
});
