// The conforming replay artifact. caputchin.json `run.entry` pins this; the
// replay isolate loads it and calls run(seed, config, trace) -> verdict. The
// melonJS sim IS the run: defineMelonEngine (from @caputchin/preset-melonjs)
// boots melonJS headless under the determinism trap, and toRun replays the
// recorded trace over the same spec the live game drives. melonjs is bundled into
// this artifact by tsup (no DOM, no rendering, no network).

// MUST be first: install the headless determinism layer + DOM shim + a seeded
// Math.random BEFORE melonjs (and the core-js it bundles) evaluate. The sealed
// replay isolate bans ambient Math.random, and core-js seeds its uid polyfill
// with Math.random() at module eval, so without this the eval-time read throws
// and the artifact never loads. Side-effect import (no bindings).
import '@caputchin/preset-melonjs/install';
import { toRun } from '@caputchin/preset-melonjs';
import { engine } from './sim/engine.js';
import { MAX_TICKS } from './sim/constants.js';

export const run = toRun(engine, { maxTicks: MAX_TICKS });
