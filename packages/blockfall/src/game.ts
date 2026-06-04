// Blockfall, built on @caputchin/preset-kaplay. A fast captcha sprint: the round
// starts from a seeded near-complete "wall" with a few open-top slots, and you
// drop a handful of pieces to clear the bottom rows. The sim is the pure
// controller in sim/controller, driven one step per fixed tick from input read
// through the preset's deterministic api (named actions + seeded RNG). The same
// scene runs in the browser and in the headless replay, so the verdict matches
// live play. Rendering, touch, and juice are browser-only (guarded by
// api.headless) and never feed the verdict.

import { defineKaplayGame, type KaplayGameApi } from '@caputchin/preset-kaplay';
import type { KAPLAYCtx } from 'kaplay';
import { resolveSimConfig } from './sim/config.js';
import { createController } from './sim/controller.js';
import { buildStrings } from './strings.js';
import { createAudio } from './audio.js';
import { setupRender, setupTouch, type Fx, type View } from './render.js';

/** Ordered actions. The index is the trace wire code: APPEND, never reorder. */
const ACTIONS: readonly string[] = ['left', 'right', 'softDrop', 'rotateCW', 'rotateCCW', 'hardDrop', 'start'];

function blockfall(k: KAPLAYCtx, api: KaplayGameApi): void {
  const cfg = resolveSimConfig((api.ctx?.config ?? null) as Record<string, unknown> | null);
  const strings = buildStrings(api.ctx?.locale ?? null);
  const randi = (n: number): number => api.randi(n);
  const shuffled = (arr: number[]): number[] => api.shuffled(arr);
  let ctrl = createController(cfg, randi, shuffled);

  let fx: Fx | null = null;
  let started = false;
  let announcedPass = false;
  let announcedOver = false;
  // Sticky once the pass threshold is first reached - survives fun restarts so
  // post-verification top-outs offer "play again" rather than "try again".
  let verified = false;
  // The congratulation prompt is up and the sim is frozen until "keep playing".
  let verifiedPause = false;

  // Start a fresh puzzle: a new controller continues the seeded stream from the
  // same position live and in the replay, so the new puzzle is deterministic.
  // Used both to retry after an unverified top-out and to play again for fun once
  // verified. Top-out is NOT reported to the preset as a verdict (no
  // api.gameOver) - the only verdict is the pass. `verified` is intentionally NOT
  // reset: once human, always human for the rest of the session.
  function restart(): void {
    ctrl = createController(cfg, randi, shuffled);
    started = true;
    verifiedPause = false;
    announcedPass = false;
    announcedOver = false;
    api.announce(strings.t('ariaGame'));
  }

  k.onFixedUpdate(() => {
    if (ctrl.state.over) {
      if (!announcedOver) {
        announcedOver = true;
        api.announce(strings.t('gameOver', { score: ctrl.state.score }));
        if (!ctrl.state.passed) fx?.onFail();
      }
      // Round ended: a `start` press (button / tap / Enter) begins a fresh
      // attempt - "try again" when not verified, "play again" for fun when
      // already verified.
      if (api.justPressed('start')) restart();
      return;
    }

    // Verified: the sim is frozen behind the congratulation prompt until the
    // player chooses to keep playing (a `start` press). The verdict was already
    // sent at the pass tick, so this freeze is live-only - the trace snapshot
    // ends at the pass, so the headless replay never records the continue and
    // never reaches this branch.
    if (verifiedPause) {
      if (api.justPressed('start')) verifiedPause = false;
      return;
    }

    // The round is gated on a `start` action: the sim stays frozen (the start
    // screen is up) until the player presses Start. `start` is recorded in the
    // trace at the tick it happens, so the headless replay freezes for the same
    // ticks and begins on the same tick - deterministic regardless of how long
    // the live player read the instructions.
    if (!started) {
      if (!api.justPressed('start')) return;
      started = true;
    }

    const { cleared, locked } = ctrl.step({
      leftHeld: api.isDown('left'),
      rightHeld: api.isDown('right'),
      leftPressed: api.justPressed('left'),
      rightPressed: api.justPressed('right'),
      softHeld: api.isDown('softDrop'),
      rotateCW: api.justPressed('rotateCW'),
      rotateCCW: api.justPressed('rotateCCW'),
      hardDrop: api.justPressed('hardDrop'),
    });

    api.setScore(ctrl.state.score);
    if (cleared > 0) {
      fx?.onClear(cleared);
      api.announce(cleared === 1 ? strings.t('clearedOne') : strings.t('clearedMany', { n: cleared }));
    } else if (locked) {
      fx?.onLock();
    }
    if (ctrl.state.passed && !announcedPass) {
      announcedPass = true;
      fx?.onPass();
      if (!verified) {
        // First verification: latch the verdict (api.pass sends the trace
        // snapshot exactly once) and raise the congratulation prompt, freezing
        // the sim. A fun game re-reaching the goal just plays the cue - it never
        // re-pauses or re-sends.
        verified = true;
        verifiedPause = true;
        api.pass();
        api.announce(strings.t('verified'));
      }
    }
  });

  if (!api.headless) {
    api.announce(strings.t('ariaGame'));
    const audio = createAudio(cfg.sound);
    const view = (): View => ({
      board: ctrl.state.board,
      active: ctrl.state.active,
      score: ctrl.state.score,
      lines: ctrl.state.lines,
      cfg,
      over: ctrl.state.over,
      passed: ctrl.state.passed,
      started,
      verified,
      verifiedPause,
    });
    fx = setupRender(k, api, strings, view, audio);
    setupTouch(k, api, view, audio);
  }
}

export const game = defineKaplayGame(blockfall, {
  actions: ACTIONS,
  keys: {
    left: ['left', 'a'],
    right: ['right', 'd'],
    softDrop: ['down', 's'],
    rotateCW: ['up', 'x', 'w'],
    rotateCCW: ['z'],
    hardDrop: ['space'],
    start: ['enter'],
  },
  // Generous cap; the replay actually stops when the recorded trace is consumed.
  maxTicks: 3 * 60 * 50,
  kaplay: { width: 270, height: 480, background: [14, 16, 24], pixelDensity: 1 },
});

export { ACTIONS };
