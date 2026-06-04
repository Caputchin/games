# Voidshot

Pilot your drone through a neon swarm and clear every wave before your shield
burns out. A Caputchin first-party captcha game, built on the
[rapier3d](https://rapier.rs) physics engine (the deterministic simulation) and
[OGL](https://github.com/oframe/ogl) (a featherweight WebGL renderer).

Voidshot is a cursor-piloted arena survival shooter: move the drone toward the
cursor and the guns aim and fire automatically, so it is fully playable with the
mouse alone, by touch (drag), or by keyboard. Clear the seeded waves to pass.

## How it proves you are human

Caputchin verifies a round by **re-running the simulation on the server**. Your
browser records an opaque input trace while you play; the server re-executes the
exact same simulation over that trace, under a seed it derives itself, and trusts
only the replayed result. A trace that did not really clear the waves replays to
a failure, and a trace recorded under one seed does not pass under another. The
score is never reported by the client.

## Architecture (one wasm, both ends)

The whole game is a Lane-2 integration: a deterministic Rust simulation that *is*
the server `run`, plus a separate browser renderer that never reaches the server.

- **The simulation** (`src/*.rs`) is rapier3d plus the game logic, compiled to a
  single clean `wasm32-unknown-unknown` module with no `wasm-bindgen` and no
  imports. It exports two C ABIs over the same code:
  - `cap_alloc` / `cap_run`: the one-shot replay the server isolate calls
    (emitted by [`caputchin-replay-rs`](https://crates.io/crates/caputchin-replay-rs)).
  - `live_new` / `live_step` / `live_state` / `live_trace` / `live_free`: the
    browser stepping interface the live driver calls.
- **The live driver** (`src/driver.ts`) steps that same wasm at a fixed timestep,
  reads entity positions out of linear memory, hands them to OGL to draw, and
  records the input trace. On a win it submits the trace for verification.
- **The renderer** (`src/render.ts`) is OGL. It only draws the simulation's state,
  so its look and its visual effects cannot influence the verdict.

Because the identical wasm module runs live and on replay, every floating-point
result agrees by construction. rapier3d runs in its enhanced-determinism mode for
cross-platform bit-exactness.

## Determinism rules (non-negotiable)

The browser and the server must agree bit-for-bit, so the simulation:

- draws all randomness from the four-word seed only (`src/rng.rs`), never a clock
  or `Math::random`;
- advances on a fixed tick, never wall-clock time;
- touches no DOM, no network, and no host state.

The `tests/determinism.rs` and `tests/replay.test.ts` suites pin the core
invariant: a trace recorded by the live stepping interface replays through the
server path to the identical verdict.

## Build

```sh
pnpm build        # builds the wasm, then the live + replay bundles into dist/
pnpm test         # cargo test (determinism) + vitest (replay + locale parity)
```

`scripts/build-wasm.sh` produces one wasm: `dist/voidshot.wasm` (the replay
module) and an inlined copy for the live bundle (the iframe CSP forbids fetching
a `.wasm`). Requires the `wasm32-unknown-unknown` Rust target; `wasm-opt`
(binaryen) shrinks the artifact when present.

## Customization

Skins, configurations, and locales live in `.caputchin/` as split shell files:

- **configurations** change the simulation (wave count, enemy count and speed,
  shield, time limit) and are pinned into the verified round.
- **skins** are render-only palettes and never touch the simulation.
- **locales** ship all official languages; English is canonical.

## Accessibility

Voidshot is fully playable by touch, by mouse, and by keyboard. Auto-aim removes
any need for precise aiming, and a polite live region announces wave starts,
shield loss, and the result, so the game is operable with a screen reader. Audio
is synthesized, optional, and never the only channel; the game is fully playable
muted.

## License

The game's own code is MIT (see [`LICENSE`](LICENSE)). The shipped artifact also
bundles Apache-2.0 (rapier3d, parry3d, nalgebra, simba, caputchin-replay-rs) and
Unlicense (OGL) code, so the package license is declared as the combined SPDX
expression `MIT AND Apache-2.0 AND Unlicense`. See
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
