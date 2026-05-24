import { describe, it, expect } from 'vitest';
import { boxesIntersect, runnerBoxes, collides, RUNNER_COLLISION_BOXES } from '../src/collision.js';
import { OBSTACLE_TYPES } from '../src/obstacles.js';
import { RUNNER_GROUND_Y } from '../src/engine.js';
import { RUNNER } from '../src/constants.js';

describe('boxesIntersect', () => {
  it('detects overlap', () => {
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });
  it('treats touching edges as no overlap', () => {
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
  it('detects separation', () => {
    expect(boxesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 })).toBe(false);
  });
});

describe('runnerBoxes', () => {
  it('uses the long flat box when ducking and the upright set otherwise', () => {
    expect(runnerBoxes(true)).toBe(RUNNER_COLLISION_BOXES.ducking);
    expect(runnerBoxes(false)).toBe(RUNNER_COLLISION_BOXES.running);
  });
});

describe('collides', () => {
  const runner = { x: RUNNER.startX, y: RUNNER_GROUND_Y, ducking: false };

  it('hits a large cactus overlapping the runner', () => {
    const t = OBSTACLE_TYPES['cactus-large'];
    const obstacle = { x: RUNNER.startX + 5, y: t.yPos as number, boxes: t.boxes };
    expect(collides(runner, obstacle)).toBe(true);
  });

  it('misses an obstacle far to the right', () => {
    const t = OBSTACLE_TYPES['cactus-large'];
    const obstacle = { x: 400, y: t.yPos as number, boxes: t.boxes };
    expect(collides(runner, obstacle)).toBe(false);
  });

  it('clears a ground cactus while airborne (well above the baseline)', () => {
    const airborne = { x: RUNNER.startX, y: RUNNER_GROUND_Y - 70, ducking: false };
    const t = OBSTACLE_TYPES['cactus-large'];
    const obstacle = { x: RUNNER.startX, y: t.yPos as number, boxes: t.boxes };
    expect(collides(airborne, obstacle)).toBe(false);
  });
});
