import { describe, it, expect } from 'vitest';
import { resolveDinoConfig } from '../src/config.js';
import type { GameContext } from '@caputchin/game-sdk';

describe('resolveDinoConfig', () => {
  it('falls back to the manifest default preset when ctx is undefined', () => {
    const c = resolveDinoConfig(undefined);
    expect(c.startSpeed).toBe(6);
    expect(c.maxSpeed).toBe(13);
    expect(c.gapCoefficient).toBe(0.6);
    expect(c.passScore).toBe(100);
    expect(c.nightMode).toBe(true);
    expect(c.birdsEnabled).toBe(true);
    // jump_velocity is exposed positive in the manifest; the engine wants an
    // upward (negative) velocity.
    expect(c.initialJumpVelocity).toBe(-10);
  });

  it('applies config overrides and negates jump_velocity', () => {
    const ctx = {
      locale: null,
      skin: null,
      config: { start_speed: 4, jump_velocity: 12, night_mode: false, birds_enabled: false },
    } as unknown as GameContext;
    const c = resolveDinoConfig(ctx);
    expect(c.startSpeed).toBe(4);
    expect(c.initialJumpVelocity).toBe(-12);
    expect(c.nightMode).toBe(false);
    expect(c.birdsEnabled).toBe(false);
    // untouched keys still come from the default preset
    expect(c.maxSpeed).toBe(13);
  });

  it('ignores malformed config values and keeps the fallback', () => {
    const ctx = {
      locale: null,
      skin: null,
      config: { start_speed: 'fast', night_mode: 'yes' },
    } as unknown as GameContext;
    const c = resolveDinoConfig(ctx);
    expect(c.startSpeed).toBe(6);
    expect(c.nightMode).toBe(true);
  });
});
