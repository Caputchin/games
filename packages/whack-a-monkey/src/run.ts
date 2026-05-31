// The conforming run artifact. This is the headless entry the marketplace
// pins (caputchin.json `run.entry`) and the replay host loads in an isolate:
// it exports `run(seed, config, trace) -> verdict`, and nothing else. No DOM,
// no rendering, no audio - `toRun` wires the pure reducer in sim/engine into
// the contract function.
//
// Self-contained by construction: `config` is the RAW server-resolved dashboard
// config (or null) and flows STRAIGHT into `engine.init`, which owns both the
// config->sim transform (`resolveSimConfig`) and the pass decision
// (`engine.result` -> `state.verified`). The live driver runs the SAME
// `engine.init` over the SAME raw config, so the replayed verdict equals live
// play - no external transform or gate that one path could compute differently.
// `toRun` adds only the truncated guard and the trace decode (a malformed blob
// yields a failing verdict, never a throw).

import { toRun } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
import { MAX_TICKS } from './sim/constants.js';

export const run = toRun(engine, { maxTicks: MAX_TICKS });
