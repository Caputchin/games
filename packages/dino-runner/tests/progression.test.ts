import { describe, it, expect } from 'vitest';
import { advanceSpeed } from '../src/progression.js';
import { ObstacleManager } from '../src/obstacles.js';
import { resolveDinoConfig } from '../src/config.js';
import { MS_PER_FRAME } from '../src/constants.js';

describe('advanceSpeed', () => {
  it('accelerates toward the cap and clamps', () => {
    expect(advanceSpeed(6, 13, 0.002, 1)).toBeCloseTo(6.002);
    expect(advanceSpeed(6, 13, 0.002, 10)).toBeCloseTo(6.02);
    expect(advanceSpeed(13, 13, 0.002, 100)).toBe(13);
    expect(advanceSpeed(12.999, 13, 1, 1)).toBe(13);
  });
});

describe('difficulty progression over a run', () => {
  it('speed ramps up and unlocks flying obstacles', () => {
    const cfg = resolveDinoConfig(undefined); // default preset
    // rng 0.99 prefers the last eligible obstacle type (the bird, once the
    // speed gate is cleared) so the spawn is deterministic.
    const obstacles = new ObstacleManager(() => 0.99);
    let speed = cfg.startSpeed;
    let maxSpeedSeen = speed;
    let sawBird = false;

    for (let i = 0; i < 4000; i += 1) {
      speed = advanceSpeed(speed, cfg.maxSpeed, cfg.acceleration, 1);
      obstacles.update(MS_PER_FRAME, speed, cfg);
      maxSpeedSeen = Math.max(maxSpeedSeen, speed);
      if (obstacles.obstacles.some((o) => o.typeId === 'bird')) sawBird = true;
    }

    expect(maxSpeedSeen).toBeGreaterThan(cfg.startSpeed); // it got faster
    expect(speed).toBeGreaterThanOrEqual(cfg.birdMinSpeed); // crossed the bird gate
    expect(sawBird).toBe(true); // birds actually appeared
  });

  // These pin the bird gate to `bird_min_speed` itself, not a hidden floor:
  // run at a fixed speed (no ramp) just below / just above the configured gate.
  function birdsSpawnAtSpeed(speed: number): boolean {
    const cfg = resolveDinoConfig(undefined);
    const obstacles = new ObstacleManager(() => 0.99); // prefer bird when eligible
    for (let i = 0; i < 3000; i += 1) {
      obstacles.update(MS_PER_FRAME, speed, cfg);
      if (obstacles.obstacles.some((o) => o.typeId === 'bird')) return true;
    }
    return false;
  }

  it('does not spawn birds below the configured unlock speed', () => {
    const cfg = resolveDinoConfig(undefined);
    expect(birdsSpawnAtSpeed(cfg.birdMinSpeed - 0.5)).toBe(false);
  });

  it('spawns birds just above the configured unlock speed (knob is the only gate)', () => {
    const cfg = resolveDinoConfig(undefined);
    // Guards against a hidden second floor (e.g. the obstacle type re-gating
    // above bird_min_speed): just past the knob, birds must appear.
    expect(birdsSpawnAtSpeed(cfg.birdMinSpeed + 0.5)).toBe(true);
  });
});
