#!/bin/bash
# Build the inlined wasm if it is MISSING **or STALE** — i.e. any Rust source or
# the Cargo manifests are newer than the generated inline. The old hooks rebuilt
# only when the inline was absent, so a Rust edit without `pnpm build:wasm` left a
# stale dist/voidshot.wasm + src/generated/live-wasm.ts behind a green `cargo test`
# (cargo recompiles Rust; vitest + the replay self-check load the stale artifact).
# This closes that footgun for prebuild/pretest/predev. Live Rust iteration still
# needs a manual rebuild (tsup --watch only rebuilds TS); this guards the build/test
# entry points, not every save.
set -euo pipefail
cd "$(dirname "$0")/.."
GEN=src/generated/live-wasm.ts

if [ ! -f "$GEN" ] \
  || [ -n "$(find src -name '*.rs' -newer "$GEN" -print -quit 2>/dev/null)" ] \
  || [ Cargo.toml -nt "$GEN" ] \
  || [ Cargo.lock -nt "$GEN" ]; then
  exec bash scripts/build-wasm.sh
fi
echo "[voidshot] inlined wasm up to date (no Rust change since last build)"
