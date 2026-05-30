# @caputchin/game-phobos

**Phobos** is a Caputchin captcha game that runs a **real DOOM engine** in the
browser. The visitor clears a few demons in a seeded arena; the server replays
the recorded run in a sandboxed WASM isolate and accepts only the recomputed
verdict, so the challenge is a genuine human-work signal, not a click.

> DOOM is a trademark of id Software LLC. Phobos is not affiliated with id /
> ZeniMax / Microsoft. It uses the GPLv2 DOOM engine and **Freedoom** (BSD) game
> data, not id assets. See `TRADEMARK.md` and `THIRD-PARTY-NOTICES.md`.

## How it works

- **Live game** (`dist/phobos.js`) - the DOOM engine compiled to WASM (SDL-free,
  a canvas + keyboard/touch platform), base64-inlined into one self-contained
  iframe bundle. It seeds the engine from `ctx.seed`, spawns the demon wave from
  that seed, records the player's input, and calls `bridge.pass({ trace })` when
  the kill goal is met.
- **Replay artifact** (`dist/run.js` + `dist/phobos.wasm`) - a headless,
  rendering-free build exporting `run(seed, config, trace) -> verdict`. The
  replay isolate re-runs the same sim over the same seed and the opaque input
  trace and counts the kills. Determinism is by construction: DOOM is fixed-point
  and the engine is seeded identically on both sides.

The arena ships monster-free; every demon is placed from the per-round seed, so a
pre-recorded input demo for one round fails under another (the monsters are
elsewhere).

## Building

Phobos needs **Emscripten** (the other first-party games are pure TypeScript).
The engine sources live in `engine/` (a vendored, patched
[doomgeneric](https://github.com/ozkl/doomgeneric) fork); the game data
`engine/wad/phobos.wad` is a committed, stripped Freedoom IWAD.

```bash
# 1. Emscripten on PATH (once per shell)
source /path/to/emsdk/emsdk_env.sh

# 2. Compile the two WASM engines (headless replay + live) and the inlined-wasm
#    codegen. `prebuild`/`predev` run this automatically when the output is
#    missing, so `pnpm build` / `pnpm dev` work after the env is sourced.
pnpm build:engines

# 3. Bundle dist/ (live IIFE + ESM run.js + phobos.wasm)
pnpm build
```

Rebuilding the IWAD from upstream Freedoom (only when changing the arena/palette)
needs `omgifol`, a node builder (`zdbsp`), and a local Freedoom WAD:

```bash
FREEDOOM_WAD=/path/to/freedoom1.wad python3 engine/wad/build-phobos-wad.py
zdbsp engine/wad/phobos-min.wad -o engine/wad/phobos.wad
```

## Running in the dev harness

Phobos is registered in the games-root `caputchin.json`, so the local indexer
picks it up. End to end:

```bash
pnpm build:engines && pnpm build        # produce dist/ (needs Emscripten)
pnpm --filter @caputchin/web db:dev-index-games   # index local builds
```

Then the harness (`http://localhost:4001`) can load it by id
`caputchin/games/phobos`, and the full bootstrap -> play -> `/verify/pass` ->
replay loop runs against the local `apps/replay` worker (the dev artifact server
serves `dist/phobos.wasm`).

## Configuration

The captcha is tunable per site via the manifest's `configurations` (resolved
server-side and applied identically in live + replay, so the verdict stays
reproducible): `pass_kills`, `start_level`, `wave_count`, `skill` (1-5),
`fast_monsters`, `respawn_monsters`, `time_limit`. Gameplay difficulty knobs are
server-owned (never read from the trace).

## License

GPL-2.0-only (the engine is GPL). See `THIRD-PARTY-NOTICES.md`.
