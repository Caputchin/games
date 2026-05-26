// The conforming run artifact (ADR-0069). This is the headless entry the
// marketplace pins (caputchin.json `run.entry`) and the replay host loads in
// an isolate: it exports `run(seed, config, trace) -> verdict`, and nothing
// else. No DOM, no rendering — `toRun` turns the pure reducer in sim/engine
// into the contract function.
//
// `passed` reads the gate from `config` (server-supplied, safe): all pairs
// must be matched (matchCount >= pairs). At MVP the server passes `null`, so
// DEFAULT_SIM_CONFIG (L1 defaults) is what the gate uses.
//
// MVP captcha path (how this fits the live game):
//   - The server issues one seed per verify session (ctx.seed).
//   - The manifest default start_level=1 → the live driver always starts on L1.
//   - The live driver calls bridge.pass only on the first new-best round; that
//     first pass is the L1 trace (recorded under L1's SimConfig).
//   - The server replays that trace with config=null → resolves to DEFAULT_SIM_CONFIG
//     (L1) → correctly gates against pairs=2.
//   - Consequence: in-game rounds beyond L1 (Harder button) are record-only; the
//     server does NOT replay them at MVP. Per-level replay with server-authoritative
//     config (start_level>1 support) is deferred to P11.
//   - There is no false-reject at MVP because the first submitted trace is always
//     L1 and config=null == L1.
//
// P11 requirement (per-round replay):
//   Replayed round is L1-only while server config injection is deferred.
//   Enabling start_level>1 or per-round (bigger-board) replay REQUIRES
//   threading the per-round SimConfig (pairs + budgetTicks + flipBackTicks)
//   into run() — otherwise a non-L1 win false-rejects.

import { toRun } from '@caputchin/engine-runtime';
import { engine } from './sim/engine.js';
import { DEFAULT_SIM_CONFIG } from './sim/config.js';
import { MAX_TICKS } from './sim/constants.js';

export const run = toRun(engine, {
  defaultConfig: DEFAULT_SIM_CONFIG,
  maxTicks: MAX_TICKS,
  passed: (outcome, config) => outcome.score >= config.pairs,
});
