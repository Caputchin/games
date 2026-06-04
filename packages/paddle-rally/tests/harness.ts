// A headless "live recorder": boots the REAL PaddleRallySim under a headless Phaser
// game (DOM stubbed by @caputchin/preset-phaser/install, imported by the test
// before this), drives the Arcade physics with a given per-frame delta sequence
// (mimicking variable display rates), applies a per-tick intent each `worldstep`,
// and records the trace + verdict exactly as the browser does, minus rendering.
// This is what lets the tests prove frame-rate-independent recording + server
// agreement against the same sim code path the live game runs.
import { bootHeadlessPhaser, onWorldStep } from '@caputchin/preset-phaser';
import type Phaser from 'phaser';
import { FIELD_H, FIELD_W, MAX_TICKS, PaddleRallySim, type Action, type PaddleRallyConfig } from '../src/sim.js';

const PHYSICS = {
  default: 'arcade',
  arcade: { gravity: { x: 0, y: 0 }, fixedStep: true, fps: 60, debug: false },
} as const;

export interface Recording {
  actions: Action[];
  score: number;
  passed: boolean;
  ticks: number;
  /** Ball centre position sampled after each step (for serve-delay assertions). */
  ballSamples: { x: number; y: number }[];
}

export interface IntentContext {
  tick: number;
  ballY: number;
  playerY: number;
}

export async function recordRun(opts: {
  seed: readonly number[];
  config: PaddleRallyConfig | null;
  intent: (ctx: IntentContext) => Action;
  frameDeltas?: number[];
  maxTicks?: number;
}): Promise<Recording> {
  const frameDeltas = opts.frameDeltas ?? [1000 / 60];
  const cap = opts.maxTicks ?? MAX_TICKS;
  let sim: PaddleRallySim | undefined;
  let tick = 0;
  const actions: Action[] = [];
  const ballSamples: { x: number; y: number }[] = [];
  const scene = {
    create(this: Phaser.Scene) {
      sim = new PaddleRallySim(opts.seed, opts.config);
      sim.create(this);
      onWorldStep(this, () => {
        if (sim!.isOver()) return;
        const a = opts.intent({ tick, ballY: sim!.ballY, playerY: sim!.playerCentreY });
        actions.push(a);
        sim!.step(a);
        ballSamples.push({ x: sim!.ballObj.x, y: sim!.ballObj.y });
        tick += 1;
      });
    },
  };
  const game = await bootHeadlessPhaser({ width: FIELD_W, height: FIELD_H, physics: PHYSICS, scene });
  game.loop?.stop();
  const stepper = game as Phaser.Game & { headlessStep(t: number, d: number): void };
  let t = 0;
  let fi = 0;
  while (tick < cap && !sim!.isOver()) {
    const fd = frameDeltas[fi++ % frameDeltas.length]!;
    t += fd;
    stepper.headlessStep(t, fd);
  }
  const r = sim!.result();
  game.destroy(true, true);
  return { actions, score: r.score, passed: r.passed, ticks: tick, ballSamples };
}

/** A chasing player: always drives toward the ball (no deadzone), so it is
 *  moving at contact, like a human holding the arrow key. That movement is what
 *  imparts the spin (english) that beats a low-difficulty rival; a paddle that
 *  perfectly stops on the ball imparts none. */
export const trackBall = ({ ballY, playerY }: IntentContext): Action =>
  ballY < playerY ? -1 : ballY > playerY ? 1 : 0;

/** An idle player (never moves). */
export const idle = (): Action => 0;

/** A constant-input bot (holds one direction). A trivial non-playing input that,
 *  like idle, must never win, its paddle pins to a wall and imparts no spin. */
export const holdUp = (): Action => -1;
export const holdDown = (): Action => 1;
