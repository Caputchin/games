// Difficulty progression: the run speed accelerates every frame toward a cap,
// which is what makes the game get harder over time (and, once fast enough,
// unlocks flying obstacles in obstacles.ts). Pure + framerate-normalized so
// game.ts stays declarative and progression.test can prove the ramp engages.

/** Next run speed after `frames` reference-frames of acceleration, clamped to
 *  `maxSpeed`. Mirrors the original's per-frame `currentSpeed += acceleration`,
 *  scaled by `frames` so a long rAF delta advances the right amount. */
export function advanceSpeed(
  speed: number,
  maxSpeed: number,
  acceleration: number,
  frames: number,
): number {
  if (speed >= maxSpeed) return maxSpeed;
  return Math.min(maxSpeed, speed + acceleration * frames);
}
