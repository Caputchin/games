#!/bin/bash
# Build the Wall Smash Bevy wasm. Two targets from one crate (cargo features):
#   - headless replay (bevy_ecs only)  -> build/wall-smash-headless.wasm
#     (caputchin.json run.modules; tsup copies it to dist/wall-smash.wasm)
#   - live render (full Bevy + WebGL2) -> wasm-bindgen glue + base64-inlined wasm
#     (the live IIFE inlines it; CSP connect-src 'none' forbids a fetch)
#
# Requires: rustup + the wasm32-unknown-unknown target, wasm-bindgen-cli (version
# matching the crate's wasm-bindgen), and wasm-opt (binaryen). Override the opt
# binary with WASM_OPT=/path/to/wasm-opt.
#
# Iteration knobs (local only; CI always does a full release build):
#   WS_FAST=1          use the `fastdev` cargo profile + skip wasm-opt (much faster
#                      link + no size pass; bundle is bigger but fine for testing).
#   WS_LIVE_ONLY=1     skip the headless build (use when only live.rs changed).
#   WS_HEADLESS_ONLY=1 skip the live render build. The headless replay artifact
#                      (build/wall-smash-headless.wasm) is all the tests need, so
#                      `pretest` uses this to avoid the expensive Bevy compile.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1090
source "$HOME/.cargo/env" 2>/dev/null || true

WASMOPT="${WASM_OPT:-wasm-opt}"
T=wasm32-unknown-unknown
mkdir -p build build/bindgen src/generated

if [ "${WS_FAST:-0}" = "1" ]; then
  PROFILE=fastdev
  PROFILE_DIR=fastdev
  echo "[wall-smash] WS_FAST: fastdev profile, skipping wasm-opt"
else
  PROFILE=release
  PROFILE_DIR=release
fi

opt_or_copy() { # $1 in, $2 out
  if [ "${WS_FAST:-0}" = "1" ]; then
    cp "$1" "$2"
  else
    "$WASMOPT" -Oz --all-features "$1" -o "$2"
  fi
}

if [ "${WS_LIVE_ONLY:-0}" != "1" ]; then
  echo "[wall-smash] headless replay build..."
  cargo build --profile "$PROFILE" --target "$T"
  opt_or_copy "target/$T/$PROFILE_DIR/wall_smash.wasm" build/wall-smash-headless.wasm
fi

if [ "${WS_HEADLESS_ONLY:-0}" != "1" ]; then
  echo "[wall-smash] live render build..."
  cargo build --profile "$PROFILE" --target "$T" --features render
  wasm-bindgen --target web --no-typescript --out-dir build/bindgen "target/$T/$PROFILE_DIR/wall_smash.wasm"
  opt_or_copy build/bindgen/wall_smash_bg.wasm build/bindgen/wall_smash_opt.wasm
  # Inline the live wasm as one gzip+base64 string the IIFE gunzips + instantiates.
  # gzip (-n: no name/mtime, deterministic) roughly halves the inlined size so the
  # live entry stays under the marketplace bundle gate; game.ts gunzips at runtime
  # (DecompressionStream, fflate fallback) before wasm-bindgen `init`.
  printf 'export default "%s";\n' "$(gzip -9 -n -c build/bindgen/wall_smash_opt.wasm | base64 -w0)" > src/generated/live-wasm.ts
  echo "[wall-smash] live $(du -h build/bindgen/wall_smash_opt.wasm | cut -f1) (+gz+b64)"
fi
