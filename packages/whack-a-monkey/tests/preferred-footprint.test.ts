import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/sim/constants.js';

describe('preferred footprint', () => {
  it('matches the logical world constants', () => {
    expect(manifest.preferred.width).toBe(WORLD_WIDTH);
    expect(manifest.preferred.height).toBe(WORLD_HEIGHT);
  });
});
