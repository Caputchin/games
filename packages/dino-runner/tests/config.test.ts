import { describe, it, expect } from 'vitest';
import { resolveDinoConfig } from '../src/config.js';

describe('resolveDinoConfig', () => {
  it('falls back to the manifest default preset when config is undefined', () => {
    const c = resolveDinoConfig(undefined);
    expect(c.startSpeed).toBe(6);
    expect(c.maxSpeed).toBe(13);
    expect(c.gapCoefficient).toBe(0.6);
    expect(c.passScore).toBe(100);
    expect(c.birdsEnabled).toBe(true);
    expect(c.sound).toBe(true);
    // jump_velocity is exposed positive in the manifest; the engine wants an
    // upward (negative) velocity.
    expect(c.initialJumpVelocity).toBe(-10);
  });

  it('applies config overrides and negates jump_velocity', () => {
    const c = resolveDinoConfig({
      start_speed: 4,
      jump_velocity: 12,
      sound: false,
      birds_enabled: false,
    });
    expect(c.startSpeed).toBe(4);
    expect(c.initialJumpVelocity).toBe(-12);
    expect(c.sound).toBe(false);
    expect(c.birdsEnabled).toBe(false);
    // untouched keys still come from the default preset
    expect(c.maxSpeed).toBe(13);
  });

  it('ignores malformed config values and keeps the fallback', () => {
    const c = resolveDinoConfig({ start_speed: 'fast', sound: 'yes' });
    expect(c.startSpeed).toBe(6);
    expect(c.sound).toBe(true);
  });
});
