import { describe, it, expect } from 'vitest';
import { ObstacleManager, obstacleTiles, OBSTACLE_TYPES } from '../src/obstacles.js';
import { resolveDinoConfig, type DinoConfig } from '../src/config.js';
import { WORLD_WIDTH } from '../src/constants.js';

const base = resolveDinoConfig(undefined);
function cfg(over: Partial<DinoConfig> = {}): DinoConfig {
  return { ...base, ...over };
}

describe('ObstacleManager spawning', () => {
  it('spawns an obstacle on the first update', () => {
    const m = new ObstacleManager(() => 0);
    m.update(16, 6, cfg());
    expect(m.obstacles.length).toBe(1);
    expect(m.obstacles[0]!.x).toBe(WORLD_WIDTH);
  });

  it('clumps cacti once past the group speed', () => {
    // rng 0.99 -> picks the last eligible type (cactus-large) and a clump of 3
    const m = new ObstacleManager(() => 0.99);
    m.update(16, 12, cfg({ birdsEnabled: false }));
    const o = m.obstacles[0]!;
    expect(o.typeId).toBe('cactus-large');
    expect(o.size).toBe(3);
    expect(o.width).toBe(OBSTACLE_TYPES['cactus-large'].width * 3);
    expect(o.boxes.length).toBe(OBSTACLE_TYPES['cactus-large'].boxes.length * 3);
  });

  it('never spawns birds when disabled, even at high speed', () => {
    const m = new ObstacleManager(() => 0.5);
    for (let i = 0; i < 40; i += 1) m.update(400, 13, cfg({ birdsEnabled: false }));
    expect(m.obstacles.every((o) => o.typeId !== 'bird')).toBe(true);
  });

  it('never spawns birds below the bird unlock speed', () => {
    const m = new ObstacleManager(() => 0.5);
    for (let i = 0; i < 40; i += 1) m.update(400, 6, cfg());
    expect(m.obstacles.every((o) => o.typeId !== 'bird')).toBe(true);
  });

  it('breaks up runs of the same type (duplication cap)', () => {
    // rng 0 always prefers the first eligible type; only the dup cap can force
    // variety, so seeing cactus-large here proves the cap kicks in.
    const m = new ObstacleManager(() => 0);
    const seen = new Set<string>();
    const tracked = new Set<object>();
    for (let i = 0; i < 30; i += 1) {
      m.update(400, 5, cfg({ birdsEnabled: false }));
      for (const o of m.obstacles) {
        if (!tracked.has(o)) {
          tracked.add(o);
          seen.add(o.typeId);
        }
      }
    }
    expect(seen.has('cactus-small')).toBe(true);
    expect(seen.has('cactus-large')).toBe(true);
  });

  it('recycles obstacles that scroll off the left edge', () => {
    const m = new ObstacleManager(() => 0.3);
    for (let i = 0; i < 60; i += 1) m.update(300, 10, cfg());
    // bounded, and nothing lingers fully off-screen
    expect(m.obstacles.every((o) => o.x + o.width >= 0)).toBe(true);
    expect(m.obstacles.length).toBeGreaterThan(0);
  });
});

describe('obstacleTiles', () => {
  it('emits one tile per clump unit for cacti', () => {
    const m = new ObstacleManager(() => 0.99);
    m.update(16, 12, cfg({ birdsEnabled: false }));
    const tiles = obstacleTiles(m.obstacles[0]!);
    expect(tiles.length).toBe(3);
    expect(tiles[0]!.dx).toBe(0);
    expect(tiles[1]!.dx).toBe(OBSTACLE_TYPES['cactus-large'].width);
  });

  it('emits the current wing frame for a bird', () => {
    const bird = {
      typeId: 'bird' as const,
      x: 0,
      y: 75,
      width: 46,
      height: 40,
      size: 1,
      boxes: [],
      gap: 0,
      speedOffset: 0,
      frame: 1,
      animTimer: 0,
    };
    expect(obstacleTiles(bird)[0]!.sprite).toBe('bird-2');
  });
});
