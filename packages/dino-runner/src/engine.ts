// The runner (T-rex) physics + pose state. Pure logic over logical world
// units: given a per-frame delta and the current run speed, it advances the
// jump arc, tracks the duck pose, and reports which sprite frame + render box
// to draw and which collision origin to test. No DOM, no timers of its own —
// game.ts drives it from the rAF loop, which keeps the physics deterministic
// and unit-testable.

import {
  WORLD_HEIGHT,
  BOTTOM_PAD,
  MS_PER_FRAME,
  RUNNER,
  JUMP,
  ANIM_MS,
} from './constants.js';
import type { DinoConfig } from './config.js';
import type { SpriteId } from './sprites.js';

export type RunnerStatus = 'waiting' | 'running' | 'jumping' | 'ducking' | 'crashed';

export interface RunnerFrame {
  sprite: SpriteId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standing top-left Y when grounded: feet rest on the baseline. */
const GROUND_Y = WORLD_HEIGHT - RUNNER.height - BOTTOM_PAD;

export class Runner {
  /** Fixed horizontal position; the world scrolls past, the runner doesn't. */
  readonly x = RUNNER.startX;
  /** Standing top-left Y (collision origin). Decreases during a jump. */
  y = GROUND_Y;
  status: RunnerStatus = 'waiting';

  private velocity = 0;
  private duckHeld = false;
  private speedDrop = false;
  /** Set once the jump has risen past `minJumpRise`; gates the variable-jump
   *  velocity cap (see endJump). */
  private reachedMinHeight = false;
  private runTimer = 0;
  /** Current run animation frame index (0 or 1). Exposed via setter so the
   *  live driver can sync from the sim view without casting private fields. */
  private runFrame = 0;
  private duckTimer = 0;
  /** Current duck animation frame index (0 or 1). Exposed via setter. */
  private duckFrame = 0;
  /** Count of completed jumps; the loop uses it to know the first input has
   *  happened (start the run on the first jump). */
  jumpCount = 0;

  constructor(private readonly cfg: DinoConfig) {}

  get grounded(): boolean {
    return this.y >= GROUND_Y;
  }

  /** Collision pose: ducking uses the long flat box, everything else the
   *  upright box set. */
  get ducking(): boolean {
    return this.status === 'ducking';
  }

  /** Move from the idle/start pose into the run. */
  start(): void {
    if (this.status === 'waiting') this.status = 'running';
  }

  startJump(speed: number): void {
    if (this.status !== 'running' && this.status !== 'ducking') return;
    this.status = 'jumping';
    this.speedDrop = false;
    this.reachedMinHeight = false;
    // Faster runs get a touch more lift, matching the original's feel.
    this.velocity = this.cfg.initialJumpVelocity - speed / 10;
  }

  /** Release of the jump control: once past the minimum lift, cap any
   *  remaining upward velocity so a tap jumps lower than a hold (the
   *  original's variable jump). */
  endJump(): void {
    if (this.status === 'jumping' && this.reachedMinHeight && this.velocity < JUMP.dropVelocity) {
      this.velocity = JUMP.dropVelocity;
    }
  }

  /** Press / release the duck control. While airborne, holding down turns the
   *  jump into a fast fall (speed drop): velocity flips downward and is
   *  multiplied by speedDropCoefficient in update(). */
  setDuck(down: boolean): void {
    this.duckHeld = down;
    if (down) {
      if (this.status === 'jumping') {
        this.speedDrop = true;
        this.velocity = 1;
      } else if (this.status === 'running') {
        this.status = 'ducking';
      }
    } else {
      this.speedDrop = false;
      if (this.status === 'ducking') this.status = 'running';
    }
  }

  crash(): void {
    this.status = 'crashed';
    this.velocity = 0;
  }

  /** Return to the idle start pose for a fresh run (same config). */
  reset(): void {
    this.y = GROUND_Y;
    this.status = 'waiting';
    this.velocity = 0;
    this.duckHeld = false;
    this.speedDrop = false;
    this.reachedMinHeight = false;
    this.runTimer = 0;
    this.runFrame = 0;
    this.duckTimer = 0;
    this.duckFrame = 0;
    this.jumpCount = 0;
  }

  /** Sync the animation frame index from the sim view (live driver only).
   *  Avoids casting private fields in game.ts. */
  setRunFrame(frame: number): void { this.runFrame = frame; }
  setDuckFrame(frame: number): void { this.duckFrame = frame; }

  /** Advance the runner's animation timers by `dtMs` of game time.
   *  Jump physics are NOT re-integrated here — when the live driver is active
   *  the sim view owns the authoritative position; syncRenderObjects() in
   *  game.ts writes `y` and `status` directly before each render pass. */
  update(dtMs: number, _speed: number): void {
    this.advanceAnimation(dtMs);
  }

  private advanceAnimation(dtMs: number): void {
    if (this.status === 'running') {
      this.runTimer += dtMs;
      if (this.runTimer >= ANIM_MS.run) {
        this.runTimer = 0;
        this.runFrame ^= 1;
      }
    } else if (this.status === 'ducking') {
      this.duckTimer += dtMs;
      if (this.duckTimer >= ANIM_MS.duck) {
        this.duckTimer = 0;
        this.duckFrame ^= 1;
      }
    }
  }

  /** The sprite + render box for the current state. The duck frame is a full
   *  44/59-wide sprite with the dino already crouched low in the art, so it
   *  renders at the same standing `y` (its feet still land on the baseline);
   *  only the width widens to the duck width. */
  frame(): RunnerFrame {
    switch (this.status) {
      case 'waiting':
        return this.upright('runner-idle');
      case 'crashed':
        return this.upright('runner-crash');
      case 'jumping':
        return this.upright('runner-jump');
      case 'ducking':
        return {
          sprite: this.duckFrame === 0 ? 'runner-duck-1' : 'runner-duck-2',
          x: this.x,
          y: this.y,
          width: RUNNER.widthDuck,
          height: RUNNER.height,
        };
      case 'running':
      default:
        return this.upright(this.runFrame === 0 ? 'runner-run-1' : 'runner-run-2');
    }
  }

  private upright(sprite: SpriteId): RunnerFrame {
    return { sprite, x: this.x, y: this.y, width: RUNNER.width, height: RUNNER.height };
  }
}

/** Re-exported for collision wiring + tests: the runner's collision origin is
 *  always the standing top-left (never the dropped duck render position). */
export function runnerCollisionOrigin(runner: Runner): { x: number; y: number; ducking: boolean } {
  return { x: runner.x, y: runner.y, ducking: runner.ducking };
}

/** The grounded standing-top Y, exported for tests asserting jump apex. */
export const RUNNER_GROUND_Y = GROUND_Y;
