// Importing sim.ts pulls Phaser at runtime (its seeded RNG), so load the headless
// shim first, otherwise Phaser's module-eval reads `window` and throws.
import '@caputchin/preset-phaser/install';
import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';
import { FIELD_W, FIELD_H } from '../src/sim.js';

// caputchin.json is the published source of truth for the preferred footprint
// (the widget reads preferred.width / preferred.height to size the iframe). The
// logical field in sim.ts is the same number. If they drift, this goes red.
describe('paddle-rally caputchin.json - preferred footprint', () => {
  const preferred = manifest.preferred as { width?: number; height?: number } | undefined;

  it('declares a preferred block', () => {
    expect(preferred).toBeDefined();
  });

  it('preferred.width matches FIELD_W in sim.ts', () => {
    expect(preferred?.width).toBe(FIELD_W);
  });

  it('preferred.height matches FIELD_H in sim.ts', () => {
    expect(preferred?.height).toBe(FIELD_H);
  });
});
