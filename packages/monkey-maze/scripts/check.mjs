// Determinism smoke-check for the built run artifact. Replays dist/run.js
// through the hostile, isolate-equivalent prober in @caputchin/replay-selfcheck
// (the lean, split-out determinism check) and fails on any ambient
// non-determinism, native-trig divergence, or run-to-run drift. Probes the
// empty-trace smoke case plus the default seeds, each over `repeats` runs.
//
// This pure-JS engine game has no wasm to load, so it consumes the check
// library directly (like the Phaser game), importing the run artifact straight.
import { selfCheckRun } from '@caputchin/replay-selfcheck';
import { run } from '../dist/run.js';

// Write directly to stdout, not console.log: some engine presets install a
// global console silencer inside the run bundle, which would otherwise swallow
// this report (leaving a blank CI log) while the exit code still gates.
const out = (s) => process.stdout.write(`${s}\n`);

const report = await selfCheckRun(run, { repeats: 8 });

for (const c of report.cases) {
  out(`  [${c.deterministic ? 'PASS' : 'FAIL'}] ${c.label}${c.verdict ? ` -> ${JSON.stringify(c.verdict)}` : ''}`);
  for (const v of c.violations) out(`         ${v.kind}: ${v.detail}`);
}
const failed = report.cases.filter((c) => !c.deterministic).length;
out(
  report.ok
    ? `\ncaputchin-selfcheck: OK (${report.cases.length} case(s) deterministic)`
    : `\ncaputchin-selfcheck: FAILED (${failed}/${report.cases.length} case(s) non-deterministic)`,
);
process.exit(report.ok ? 0 : 1);
