#!/bin/bash
# Build the single Voidshot wasm. ONE clean wasm32-unknown-unknown cdylib carries
# both C-ABIs (cap_* replay + live_* browser); it is delivered two ways:
#   - dist/voidshot.wasm         : run.modules (replay isolate loads it precompiled)
#   - src/generated/live-wasm.ts : gzip+base64 inline for the live IIFE (iframe CSP forbids fetch)
#
# Requires: rustup + the wasm32-unknown-unknown target. wasm-opt (binaryen) shrinks
# the artifact when present; override with WASM_OPT=/path/to/wasm-opt.
# Iteration: VS_FAST=1 uses the fastdev profile + skips wasm-opt.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1090
source "$HOME/.cargo/env" 2>/dev/null || true

WASMOPT="${WASM_OPT:-wasm-opt}"
T=wasm32-unknown-unknown
mkdir -p dist src/generated build

if [ "${VS_FAST:-0}" = "1" ]; then
  PROFILE=fastdev
  echo "[voidshot] VS_FAST: fastdev profile, skipping wasm-opt"
else
  PROFILE=release
fi

echo "[voidshot] cargo build ($PROFILE)..."
cargo build --profile "$PROFILE" --target "$T"
RAW="target/$T/$PROFILE/voidshot.wasm"

OUT=build/voidshot.wasm
if [ "${VS_FAST:-0}" != "1" ] && command -v "$WASMOPT" >/dev/null 2>&1; then
  "$WASMOPT" -Oz --all-features "$RAW" -o "$OUT"
else
  [ "${VS_FAST:-0}" = "1" ] || echo "[voidshot] wasm-opt not found; shipping unoptimized wasm"
  cp "$RAW" "$OUT"
fi

cp "$OUT" dist/voidshot.wasm
# gzip (-n: deterministic, no name/mtime) + base64; the live IIFE gunzips at runtime.
printf 'export default "%s";\n' "$(gzip -9 -n -c "$OUT" | base64 -w0)" > src/generated/live-wasm.ts
echo "[voidshot] wasm $(du -h "$OUT" | cut -f1) -> dist/voidshot.wasm + inlined src/generated/live-wasm.ts"
