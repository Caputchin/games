// Axis-aligned collision detection, ported from the Chrome dino's per-sprite
// collision boxes. Each sprite carries a set of small boxes (in its own
// top-left-origin sprite space) that approximate its silhouette far better
// than a single bounding rect; a hit requires any runner box to overlap any
// obstacle box. All math is on logical world coordinates, never DOM reads,
// so collision is deterministic and frame-rate independent.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard AABB overlap test. Touching edges do not count as a hit. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Runner collision boxes in sprite space (top-left origin). The running set
// traces head / neck / body / legs; the duck set is one long flat box. These
// are the Chrome t-rex collision boxes verbatim.
export const RUNNER_COLLISION_BOXES: { running: readonly Box[]; ducking: readonly Box[] } = {
  running: [
    { x: 22, y: 0, width: 17, height: 16 },
    { x: 1, y: 18, width: 30, height: 9 },
    { x: 10, y: 35, width: 14, height: 8 },
    { x: 1, y: 24, width: 29, height: 5 },
    { x: 5, y: 30, width: 21, height: 4 },
    { x: 9, y: 34, width: 15, height: 4 },
  ],
  ducking: [{ x: 1, y: 18, width: 55, height: 25 }],
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
