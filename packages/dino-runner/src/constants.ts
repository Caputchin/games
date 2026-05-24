// Physics + geometry constants for Dino Runner, ported from the Chrome
// "t-rex runner" offline game so the feel matches the original. All values
// are in a fixed logical coordinate space (WORLD_WIDTH x WORLD_HEIGHT);
// styles.ts scales that space to whatever pixel size the iframe gives us,
// so the physics never has to be re-tuned per viewport.
//
// The engine ticks on a fixed 60-FPS reference: per-frame deltas are
// expressed against MS_PER_FRAME so a slow rAF frame advances the world by
// the right amount instead of stuttering (see engine.ts step()).

/** Fixed reference frame rate the physics constants are tuned against. */
export const FPS = 60;
export const MS_PER_FRAME = 1000 / FPS;

/** Logical play-field size. The authentic Chrome dino canvas footprint. */
export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 150;

/** Ground geometry. The runner's feet and every ground obstacle sit on the
 *  baseline at WORLD_HEIGHT - BOTTOM_PAD. */
export const BOTTOM_PAD = 10;
export const GROUND_LINE_HEIGHT = 12;

/** Runner (T-rex) box dimensions in logical units. */
export const RUNNER = {
  width: 44,
  height: 47,
  widthDuck: 59,
  heightDuck: 25,
  startX: 50,
} as const;

/** Vertical-motion tuning for the jump arc. Unlike the original (which hard-
 *  clamps the apex), the apex here emerges from projectile physics
 *  (apex = v^2 / 2g) so the manifest's `jump_velocity` + `gravity` knobs both
 *  change feel. `initialVelocity` is the negated default `jump_velocity`;
 *  `speedDropCoefficient` multiplies gravity for the duck-to-fast-fall move.
 *  `ceilingY` keeps a very high jump from leaving the top of the world. */
export const JUMP = {
  gravity: 0.6,
  initialVelocity: -8.5,
  speedDropCoefficient: 3,
  ceilingY: 4,
} as const;

/** Horizontal-speed progression. Speed accelerates every frame until it
 *  caps at maxSpeed; distance accrues from the current speed. */
export const SPEED = {
  initial: 6,
  max: 13,
  acceleration: 0.001,
} as const;

/** Distance (logical units) between day <-> night inversions. */
export const INVERT_DISTANCE = 700;
/** Milliseconds the day<->night color cross-fade runs. */
export const INVERT_FADE_MS = 1500;

/** Obstacle spacing. Larger gapCoefficient => more space between obstacles. */
export const GAP_COEFFICIENT = 0.6;
/** Max obstacles grouped side-by-side (cacti can clump up to 3 wide). */
export const MAX_OBSTACLE_LENGTH = 3;
/** Max times the same obstacle type may repeat back-to-back. */
export const MAX_OBSTACLE_DUPLICATION = 2;

/** Score = floor(distanceRan * SCORE_COEFFICIENT). Mirrors Chrome's
 *  distance-meter coefficient so a run reads as a familiar 5-digit score. */
export const SCORE_COEFFICIENT = 0.025;

/** Sprite-frame animation cadences (ms per frame). */
export const ANIM_MS = {
  run: 1000 / 12,
  duck: 1000 / 8,
  bird: 1000 / 6,
  blink: 7000,
} as const;

/** Background scenery motion, expressed as a fraction of the run speed. */
export const CLOUD_SPEED_RATIO = 0.2;
export const STAR_SPEED_RATIO = 0.3;
export const MOON_SPEED_RATIO = 0.25;
export const MAX_CLOUDS = 6;
