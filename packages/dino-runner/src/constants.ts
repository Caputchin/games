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

/** Runner (T-rex) box dimensions in logical units. The duck frame renders at
 *  the full `height` (the dino is crouched within the art); its narrower
 *  collision footprint lives as a verbatim box in collision.ts. */
export const RUNNER = {
  width: 44,
  height: 47,
  widthDuck: 59,
  startX: 50,
} as const;

/** Vertical-motion tuning for the jump arc, ported verbatim from the original
 *  Chrome `Trex.updateJump`. The dino rises under `initialVelocity` decaying
 *  by `gravity` each frame (a tall ~65px hop, not a clamped one):
 *   - past `minJumpRise` of lift the player may cut the jump short by
 *     releasing (the `endJump` velocity cap to `dropVelocity`) — tap vs hold.
 *   - at `autoCapRise` of lift the rise auto-caps to `dropVelocity` so a held
 *     jump can't fly off the top (the original reused config.maxJumpHeight as
 *     an absolute y; with this world's ground at 93 that equals ~63px lift).
 *   - ducking mid-air sets a fast fall: velocity flips down and is multiplied
 *     by `speedDropCoefficient`.
 *  `ceilingY` is a final safety so a tuned-up `jump_velocity` can't escape the
 *  world top. */
export const JUMP = {
  gravity: 0.6,
  initialVelocity: -10,
  dropVelocity: -5,
  speedDropCoefficient: 3,
  minJumpRise: 30,
  autoCapRise: 63,
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
