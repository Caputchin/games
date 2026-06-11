// Chef Rush, defined once: the sim runs on both ends (api.onTick), the renderer
// only in the browser (guarded by api.headless). Both ends run the SAME sim over
// the SAME fixed-dt ticks via @caputchin/preset-excalibur, so the live result and
// the server verdict agree by construction.

import { defineExcaliburGame, type ExcaliburGameApi } from '@caputchin/preset-excalibur';
import type { Engine } from 'excalibur';
import { resolveSimConfig } from './sim/config.js';
import { createChefSim } from './sim/sim.js';
import { MAX_TICKS, WORLD_H, WORLD_W } from './sim/constants.js';
import { collisionGeometry } from './scene/collision-geom.js';
import { buildKitchenScene } from './scene/kitchen-scene.js';

export const game = defineExcaliburGame(
  (engine: Engine, api: ExcaliburGameApi) => {
    const cfg = resolveSimConfig((api.ctx?.config ?? null) as Record<string, unknown> | null);
    // The verdict's pointer hit-tests run through Excalibur's collision geometry on
    // BOTH ends (live + headless replay) - the engine genuinely decides drop-target /
    // prep-hit / button-hit. It is parity-proven bit-identical to the integer geometry
    // the offline red-team plans with (tests/collision-parity.test.ts).
    const sim = createChefSim(api, cfg, collisionGeometry());
    api.onTick(() => sim.tick());
    if (!api.headless) buildKitchenScene(engine, api, sim);
  },
  { width: WORLD_W, height: WORLD_H, maxTicks: MAX_TICKS },
);
