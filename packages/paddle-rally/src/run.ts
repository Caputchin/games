// The headless replay entry: the SAME Arcade physics scene the player ran
// re-executes on the server over the recorded trace. The install side-effect is
// FIRST so the determinism layer + DOM stubs are in place before phaser evaluates.
// Per-tick logic runs on the `worldstep` event (frame-rate-independent), exactly
// as the live game records it, so the verdict matches bit-for-bit.
import '@caputchin/preset-phaser/install';
import type Phaser from 'phaser';
import { makePhaserRun, onWorldStep } from '@caputchin/preset-phaser';
import { decode } from './codec.js';
import { FIELD_H, FIELD_W, MAX_TICKS, STEP_MS, PaddleRallySim, type Action, type PaddleRallyConfig } from './sim.js';

export const run = makePhaserRun<Action, PaddleRallyConfig>({
  width: FIELD_W,
  height: FIELD_H,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fixedStep: true, fps: 60, debug: false } },
  maxTicks: MAX_TICKS,
  stepMs: STEP_MS,
  decode,
  createScene: ({ seed, config, actions, trap }) => {
    let sim: PaddleRallySim | undefined;
    let tick = 0;
    return {
      scene: {
        create(this: Phaser.Scene) {
          sim = new PaddleRallySim(seed, config);
          sim.create(this);
          onWorldStep(this, () => {
            // Step the sim inside the seeded Math.random trap, the live game wraps
            // its sim.step the same way, so any raw Math.random read is symmetric.
            trap.run(() => sim?.step(actions[tick] ?? 0));
            tick += 1;
          });
        },
      },
      tickCount: () => tick,
      isOver: () => sim?.isOver() ?? false,
      result: () => (sim ? sim.result() : { score: 0, passed: false }),
    };
  },
});
