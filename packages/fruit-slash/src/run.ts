// The conforming run artifact. This is the headless entry the
// marketplace pins (caputchin.json `run.entry`) and the replay host loads in an
// isolate: it exports `run(seed, config, trace) -> verdict`, and nothing else.
// No DOM, no rendering, no audio — `toRun` turns the pure reducer in sim/engine
// into the contract function.
//
// `passed` reads the gate threshold from `config` (server-supplied, safe), never
// from the trace. At MVP the server passes `null`, so DEFAULT_SIM_CONFIG is what
// the gate uses; per-site config injection is a deferred server-only phase.

import { toRun } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
import { DEFAULT_SIM_CONFIG } from './sim/config.js';
import { MAX_TICKS } from './sim/constants.js';

export const run = toRun(engine, {
  defaultConfig: DEFAULT_SIM_CONFIG,
  maxTicks: MAX_TICKS,
  passed: (outcome, config) => outcome.score >= config.passScore,
});
