import { describe, it, expect } from 'vitest';
import { resolveWhackConfig } from '../src/config.js';
import type { GameContext } from '@caputchin/game-sdk';

function ctxWith(config: Record<string, unknown> | null): GameContext {
  return { locale: null, skin: null, seed: null, config: config as GameContext['config'] };
}

describe('resolveWhackConfig', () => {
  it('falls back to the manifest default preset when ctx is undefined', () => {
    expect(resolveWhackConfig(undefined)).toEqual({
      passHits: 10,
      baseUptimeMs: 800,
      baseDecoyChance: 0.1,
      seconds: 25,
      sound: true,
      showScore: true,
    });
  });

  it('applies per-key overrides from ctx.config', () => {
    const c = resolveWhackConfig(ctxWith({ pass_hits: 14, base_uptime_ms: 550, base_decoy_chance: 0.25, seconds: 18, sound: false, show_score: false }));
    expect(c).toEqual({ passHits: 14, baseUptimeMs: 550, baseDecoyChance: 0.25, seconds: 18, sound: false, showScore: false });
  });

  it('falls back on malformed values', () => {
    const c = resolveWhackConfig(ctxWith({ pass_hits: 'lots', base_uptime_ms: null, sound: 'yes' }));
    expect(c.passHits).toBe(10);
    expect(c.baseUptimeMs).toBe(800);
    expect(c.sound).toBe(true);
  });

  it('clamps every numeric knob to its humane range', () => {
    const tooHard = resolveWhackConfig(ctxWith({ pass_hits: 999, base_uptime_ms: 10, base_decoy_chance: 5, seconds: 999 }));
    expect(tooHard.passHits).toBe(30);
    expect(tooHard.baseUptimeMs).toBe(350);
    expect(tooHard.baseDecoyChance).toBe(0.5);
    expect(tooHard.seconds).toBe(90);
    const tooEasy = resolveWhackConfig(ctxWith({ pass_hits: 0, base_uptime_ms: 99999, base_decoy_chance: -1, seconds: 1 }));
    expect(tooEasy.passHits).toBe(3);
    expect(tooEasy.baseUptimeMs).toBe(2000);
    expect(tooEasy.baseDecoyChance).toBe(0);
    expect(tooEasy.seconds).toBe(5);
  });
});
