import { describe, it, expect } from 'vitest';
import { createSfx } from '../src/audio.js';
import { SOUND_CLIPS } from '../src/sounds.js';

describe('createSfx', () => {
  it('returns a safe no-op when sound is disabled', () => {
    const sfx = createSfx(window, false, SOUND_CLIPS);
    expect(() => {
      sfx.resume();
      sfx.jump();
      sfx.score();
      sfx.hit();
      sfx.dispose();
    }).not.toThrow();
  });

  it('returns a safe no-op when the Web Audio API is unavailable', () => {
    const fakeView = {} as unknown as Window;
    const sfx = createSfx(fakeView, true, SOUND_CLIPS);
    expect(() => {
      sfx.resume();
      sfx.jump();
      sfx.hit();
      sfx.dispose();
    }).not.toThrow();
  });
});
