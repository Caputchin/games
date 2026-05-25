import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/constants.js';

// The advertised footprint must equal the logical world the game renders, so
// the widget sizes the iframe to match what we draw.
describe('preferred footprint', () => {
  it('manifest.preferred equals the logical world', () => {
    expect(manifest.preferred.width).toBe(WORLD_WIDTH);
    expect(manifest.preferred.height).toBe(WORLD_HEIGHT);
  });
});
