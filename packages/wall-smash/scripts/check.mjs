// Determinism smoke-check for the built run artifact (wasm engine). Replays
// dist/run.js through the hostile, isolate-equivalent prober in
// @caputchin/replay-selfcheck and fails on any ambient non-determinism,
// native-trig divergence, or run-to-run drift. Probes the empty-trace smoke
// case plus the default seeds, each over `repeats` runs.
//
// dist/run.js loads its engine via the Cloudflare/workerd module-loader
// convention (`import mod from './engine.wasm'`, where mod is a compiled
// WebAssembly.Module), which the production replay isolate supports natively
// but plain Node ESM does not. We register a loader hook replicating that
// convention, then dynamically import the run artifact so the exact shipped
// bytes are replayed. WebAssembly execution is deterministic across V8, so the
// Node verdict matches the workerd one.
import { register } from 'node:module';
import { selfCheckRun } from '@caputchin/replay-selfcheck';

register(new URL('./wasm-import-hook.mjs', import.meta.url));
const { run } = await import('../dist/run.js');

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
