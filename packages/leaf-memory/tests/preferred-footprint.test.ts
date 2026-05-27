import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';
import { STAGE_WIDTH, STAGE_HEIGHT } from '../src/styles.js';

// caputchin.json is the published source of truth for the game's preferred
// footprint (the widget reads `preferred.width` / `preferred.height` to size
// the iframe). styles.ts independently computes the same footprint from the
// cell-grid layout constants. These two MUST agree: if the cell sizing
// changes, the manifest must be updated to match. This test is the guard
// that turns silent drift into a red build.
describe('leaf-memory caputchin.json - preferred footprint', () => {
  const preferred = manifest.preferred as { width?: number; height?: number } | undefined;

  it('declares a preferred block', () => {
    expect(preferred).toBeDefined();
  });

  it('preferred.width matches the stage footprint computed in styles.ts', () => {
    expect(preferred?.width).toBe(STAGE_WIDTH);
  });

  it('preferred.height matches the stage footprint computed in styles.ts', () => {
    expect(preferred?.height).toBe(STAGE_HEIGHT);
  });
});
