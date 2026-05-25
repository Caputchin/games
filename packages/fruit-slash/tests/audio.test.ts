import { describe, it, expect } from 'vitest';
import { createSfx } from '../src/audio.js';

// Sound is best-effort: in environments without Web Audio (happy-dom), or when
// disabled, every method must no-op without throwing so callers never guard.
describe('createSfx', () => {
  it('never throws, with or without Web Audio available', () => {
    const sfx = createSfx(window, true);
    expect(() => {
      sfx.resume();
      sfx.slice();
      sfx.bomb();
      sfx.life();
      sfx.verify();
      sfx.setEnabled(false);
      sfx.slice();
      sfx.dispose();
    }).not.toThrow();
  });

  it('no-ops when created disabled', () => {
    const sfx = createSfx(window, false);
    expect(() => {
      sfx.slice();
      sfx.verify();
      sfx.dispose();
    }).not.toThrow();
  });
});
