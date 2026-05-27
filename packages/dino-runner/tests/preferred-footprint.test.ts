import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';
import { STAGE_WIDTH, STAGE_HEIGHT } from '../src/styles.js';

// caputchin.json is the published source of truth for the preferred footprint
// (the widget reads preferred.width / preferred.height to size the iframe).
// styles.ts derives the same numbers from the logical world. If they drift,
// this turns it into a red build.
describe('dino-runner caputchin.json - preferred footprint', () => {
  const preferred = manifest.preferred as { width?: number; height?: number } | undefined;

  it('declares a preferred block', () => {
    expect(preferred).toBeDefined();
  });

  it('preferred.width matches the world width in styles.ts', () => {
    expect(preferred?.width).toBe(STAGE_WIDTH);
  });

  it('preferred.height matches the world height in styles.ts', () => {
    expect(preferred?.height).toBe(STAGE_HEIGHT);
  });
});
