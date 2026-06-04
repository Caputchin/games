// Trace integrity over the REAL live scene: boot PaddleRallyScene headless (Phaser via
// the shim), drive start -> play, let a tracking player play a full round on the
// actual worldstep recorder, then prove the trace it recorded replays through
// run() to the SAME verdict the scene itself reached. This exercises the live
// recording path end to end (start screen does not pollute the trace; recording
// begins at sim tick 0). `./install` is first so the shim is in place before
// phaser. The headless game carries the same Arcade physics config as the live one.
import '@caputchin/preset-phaser/install';
import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import type { Seed } from '@caputchin/game-sdk';
import { PaddleRallyScene } from '../src/index.js';
import { run } from '../src/run.js';
import { encode } from '../src/codec.js';
import { MAX_TICKS, STEP_MS, type Action, type PaddleRallyConfig } from '../src/sim.js';

function stubEl(): unknown {
  return { setAttribute() {}, style: { cssText: '' }, appendChild() {}, textContent: '' };
}

interface SceneInternals {
  phase: string;
  actions: Action[];
  keyIntent: number;
  onConfirm(): void;
  sim: { playerPoints: number; cpuPoints: number; ballObj: { y: number }; playerObj: { y: number } };
}

describe('live recorder trace integrity', () => {
  it('records play from tick 0 and the trace replays to the scene verdict', async () => {
    const seed: Seed = [11, 22, 33, 44];
    const config: PaddleRallyConfig = { target: 2, cpu_difficulty: 1 };
    const container = { ownerDocument: { createElement: () => stubEl() }, appendChild() {} } as unknown as HTMLElement;
    const bridge = { pass() {}, error() {}, setSize() {}, layout: null };
    const deps = { container, bridge, ctx: { seed, config, locale: null, skin: null } };

    const game = await new Promise<Phaser.Game>((resolve) => {
      const g = new Phaser.Game({
        type: Phaser.HEADLESS,
        width: 640,
        height: 400,
        banner: false,
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.NONE },
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fixedStep: true, fps: 60, debug: false } },
        callbacks: { postBoot: () => resolve(g) },
      });
    });
    game.scene.add('paddle-rally', PaddleRallyScene, true, deps);
    const stepper = game as Phaser.Game & { headlessStep(t: number, d: number): void };
    let t = 0;
    stepper.headlessStep((t += STEP_MS), STEP_MS); // run scene create (phase 'start')

    const scene = game.scene.getScene('paddle-rally') as unknown as SceneInternals;
    expect(scene.phase).toBe('start');
    scene.onConfirm(); // start -> play
    expect(scene.phase).toBe('play');

    // A chasing player: drive toward the ball each tick with no deadzone, so the
    // paddle is moving at contact and imparts the spin (english) that beats the
    // easy rival. (A deadzone tracker that stops on the ball imparts none.)
    let i = 0;
    while (scene.phase === 'play' && i < MAX_TICKS) {
      const c = scene.sim.playerObj.y;
      const b = scene.sim.ballObj.y;
      scene.keyIntent = b < c ? -1 : b > c ? 1 : 0;
      stepper.headlessStep((t += STEP_MS), STEP_MS);
      i += 1;
    }
    const actions = scene.actions.slice();
    const won = scene.phase === 'won';
    const playerPoints = scene.sim.playerPoints;
    game.destroy(true, true);

    expect(actions.length).toBeGreaterThan(0);
    expect(won).toBe(true); // tracker wins difficulty 1
    const verdict = await run(seed, config, encode(actions));
    expect(verdict.passed).toBe(won);
    expect(verdict.score).toBe(playerPoints);
  });
});
