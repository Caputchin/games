import { describe, it, expect } from 'vitest';
import type { GameContext } from '@caputchin/game-sdk';
import { resolveFruitSlashConfig } from '../src/config.js';

describe('resolveFruitSlashConfig', () => {
  it('returns the manifest default-preset values when ctx is undefined', () => {
    const c = resolveFruitSlashConfig(undefined);
    expect(c.passScore).toBe(8);
    expect(c.lives).toBe(3);
    expect(c.spawnRate).toBeCloseTo(0.9);
    expect(c.gravity).toBe(1400);
    expect(c.hazardChance).toBeCloseTo(0.18);
    expect(c.sound).toBe(true);
    expect(c.showScore).toBe(true);
    expect(c.showLives).toBe(true);
  });

  it('applies valid ctx.config overrides', () => {
    const ctx = { locale: null, skin: null, config: { pass_score: 12, lives: 5, hazard_chance: 0.3 } } as unknown as GameContext;
    const c = resolveFruitSlashConfig(ctx);
    expect(c.passScore).toBe(12);
    expect(c.lives).toBe(5);
    expect(c.hazardChance).toBeCloseTo(0.3);
    // untouched keys keep defaults
    expect(c.gravity).toBe(1400);
  });

  it('falls back per-key on malformed values', () => {
    const ctx = { locale: null, skin: null, config: { pass_score: 'lots', lives: null, gravity: NaN } } as unknown as GameContext;
    const c = resolveFruitSlashConfig(ctx);
    expect(c.passScore).toBe(8);
    expect(c.lives).toBe(3);
    expect(c.gravity).toBe(1400);
  });

  it('clamps out-of-range numbers into sane bounds', () => {
    const ctx = { locale: null, skin: null, config: { hazard_chance: 9, spawn_rate: 999, gravity: 1 } } as unknown as GameContext;
    const c = resolveFruitSlashConfig(ctx);
    expect(c.hazardChance).toBeLessThanOrEqual(1);
    expect(c.spawnRate).toBeLessThanOrEqual(5);
    expect(c.gravity).toBeGreaterThanOrEqual(200);
  });
});
