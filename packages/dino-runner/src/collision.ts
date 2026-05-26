// Axis-aligned collision detection, ported from the Chrome dino's per-sprite
// collision boxes. Each sprite carries a set of small boxes (in its own
// top-left-origin sprite space) that approximate its silhouette far better
// than a single bounding rect; a hit requires any runner box to overlap any
// obstacle box. All math is on logical world coordinates, never DOM reads,
// so collision is deterministic and frame-rate independent.
//
// Runner collision boxes (RUNNER_BOXES_RUNNING / RUNNER_BOXES_DUCKING) live in
// sim/constants.ts as the single source of truth; both this module and the
// headless sim engine import them from there so neither can drift.

import { RUNNER_BOXES_RUNNING, RUNNER_BOXES_DUCKING } from './sim/constants.js';
import type { SimBox } from './sim/constants.js';

/** Re-exported under the render-layer name for backward compat. */
export type Box = SimBox;

/** Standard AABB overlap test. Touching edges do not count as a hit. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Runner collision boxes — canonical values from sim/constants.ts.
export const RUNNER_COLLISION_BOXES: { running: readonly Box[]; ducking: readonly Box[] } = {
  running: RUNNER_BOXES_RUNNING,
  ducking: RUNNER_BOXES_DUCKING,
};

/** Select the active runner box set for the current pose. */
export function runnerBoxes(ducking: boolean): readonly Box[] {
  return ducking ? RUNNER_COLLISION_BOXES.ducking : RUNNER_COLLISION_BOXES.running;
}

/** Translate a sprite-space box into world space by its entity origin. */
function translate(box: Box, originX: number, originY: number): Box {
  return { x: box.x + originX, y: box.y + originY, width: box.width, height: box.height };
}

export interface CollidableRunner {
  x: number;
  y: number;
  ducking: boolean;
}

export interface CollidableObstacle {
  x: number;
  y: number;
  boxes: readonly Box[];
}

/** True if the runner (at its world origin + pose) collides with the
 *  obstacle (at its world origin + its sprite boxes). */
export function collides(runner: CollidableRunner, obstacle: CollidableObstacle): boolean {
  const rBoxes = runnerBoxes(runner.ducking);
  for (const rb of rBoxes) {
    const worldR = translate(rb, runner.x, runner.y);
    for (const ob of obstacle.boxes) {
      const worldO = translate(ob, obstacle.x, obstacle.y);
      if (boxesIntersect(worldR, worldO)) return true;
    }
  }
  return false;
}
