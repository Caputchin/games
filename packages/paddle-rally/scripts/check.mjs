// Determinism smoke-check for the built run artifact. Replays dist/run.js through the
// hostile, isolate-equivalent prober in @caputchin/replay-selfcheck (the lean,
// split-out determinism check) and fails on any ambient non-determinism, native-trig
// divergence, or run-to-run drift. Probes the empty-trace smoke case plus the default
// seeds, each over `repeats` runs.
//
// A standalone Phaser game (this one) consumes the check LIBRARY directly, so it deps
// only @caputchin/replay-selfcheck — never @caputchin/engine-runtime (the engine-game
// runtime kit, which also ships a richer CLI for games that record traces).
import { selfCheckRun } from '@caputchin/replay-selfcheck';
import { run } from '../dist/run.js';

const report = await selfCheckRun(run, { repeats: 8 });

for (const c of report.cases) {
  console.log(`  [${c.deterministic ? 'PASS' : 'FAIL'}] ${c.label}${c.verdict ? ` -> ${JSON.stringify(c.verdict)}` : ''}`);
  for (const v of c.violations) console.log(`         ${v.kind}: ${v.detail}`);
}
const failed = report.cases.filter((c) => !c.deterministic).length;
console.log(
  report.ok
    ? `\ncaputchin-selfcheck: OK (${report.cases.length} case(s) deterministic)`
    : `\ncaputchin-selfcheck: FAILED (${failed}/${report.cases.length} case(s) non-deterministic)`,
);
process.exit(report.ok ? 0 : 1);
