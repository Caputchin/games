import { describe, it, expect } from 'vitest';
import manifest from '../caputchin.json';

// leaf-memory is a perfect-information memory puzzle: the answer (the leaf kind
// behind each card) is rendered during the peek phase and sits in the JS heap
// for the whole round, so it is reachable by a heap/seed reader regardless of
// the view()-hide. The red-team proves this: `pnpm -C redteam solve:leaf-heap`
// (reads sim state.cards.kind) matches every pair at 100%, versus the cheap
// view()-reader's 0% (`pnpm -C redteam solve`). A fully client-side
// deterministic memory game cannot be made bot-proof — see
// docs/features/game-captcha-constitution.md (Appendix D, the filled
// leaf-memory scorecard) and rule CLASS (low-trust, never a sole gate).
//
// Because the gameplay answer is effectively free, the ONLY real throttle on
// the instant solver is the platform wall-clock min-solve floor: /verify/pass
// rejects a pass whose real elapsed time is below
// max(session.minSolveMs, 0.7 x replayed durationMs). For an instant solve the
// sim-relative term is ~0, so the AUTHORED minSolveMs below is the binding
// floor. It is calibrated:
//   - ABOVE the instant heap/seed solver (~300ms of network round-trips), so a
//     bot is forced to sleep to the floor, throttling its throughput.
//   - BELOW the fastest real human: the wall clock is measured from
//     /verify/start, so it already includes the iframe load, the start-screen
//     click, the ~400ms peek phase, and four card flips (> 1500ms of wall
//     time) — it can never false-reject a human.
// Dropping, deleting, or lowering this value silently would remove
// leaf-memory's only throttle. This test turns that regression into a red build.
describe('leaf-memory caputchin.json - minSolveMs wall-clock floor', () => {
  const minSolveMs = (manifest as { minSolveMs?: unknown }).minSolveMs;

  it('declares the wall-clock floor', () => {
    expect(typeof minSolveMs).toBe('number');
  });

  it('pins the floor at 1000ms (the calibrated throttle for the instant solver)', () => {
    expect(minSolveMs).toBe(1000);
  });

  it('keeps the floor above the instant-solver round-trip and below the fastest human', () => {
    // ~300ms instant-bot RTT < floor < ~1500ms fastest-human wall time.
    expect(minSolveMs as number).toBeGreaterThan(300);
    expect(minSolveMs as number).toBeLessThan(1500);
  });
});
