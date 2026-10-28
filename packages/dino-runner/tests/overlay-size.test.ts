import { describe, it, expect } from 'vitest';
import { overlaySize, STAGE_HEIGHT } from '../src/styles.js';

// The start / game-over overlay picks its chrome from the stage height. A
// short strip (a pinned height, or 600x150 scaled to a 375 viewport: 359x90)
// must land in the compact bucket that moves the controls hint beside the
// button, or the title and hint clip.
describe('dino-runner overlaySize', () => {
  it('keeps the preferred 150px height at md', () => {
    expect(overlaySize(STAGE_HEIGHT)).toBe('md');
  });

  it('maps each bucket boundary', () => {
    expect(overlaySize(400)).toBe('lg');
    expect(overlaySize(220)).toBe('lg');
    expect(overlaySize(219.5)).toBe('md');
    expect(overlaySize(149.9)).toBe('sm');
    expect(overlaySize(130)).toBe('sm');
    expect(overlaySize(129.9)).toBe('xs');
  });

  it('puts a 90px strip in xs', () => {
    expect(overlaySize(90)).toBe('xs');
  });
});
