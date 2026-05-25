import { describe, it, expect } from 'vitest';
import { createSfx } from '../src/audio.js';

// happy-dom has no Web Audio, so every method must no-op safely (the game never
// guards calls). This mirrors fruit-slash's audio test.

describe('createSfx', () => {
  it('never throws with no Web Audio available, enabled or disabled', () => {
    const sfx = createSfx(window, true);
    expect(() => {
      sfx.whack();
      sfx.decoy();
      sfx.level();
      sfx.verify();
      sfx.resume();
    }).not.toThrow();
    sfx.setEnabled(false);
    expect(() => sfx.whack()).not.toThrow();
    expect(() => sfx.dispose()).not.toThrow();
  });

  it('is a no-op when created disabled', () => {
    const sfx = createSfx(window, false);
    expect(() => {
      sfx.whack();
      sfx.verify();
    }).not.toThrow();
    sfx.dispose();
  });
});
