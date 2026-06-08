#!/usr/bin/env bash
# Run build-engines.sh inside the official emscripten/emsdk container, so a dev
# machine with no local Emscripten toolchain can still rebuild + test phobos.
#
# Why this exists: phobos is a C/WASM (Emscripten) game. CI installs emcc with
# mymindstorm/setup-emsdk and calls build-engines.sh directly; a typical dev box
# has no emcc, which blocks `pnpm build` / `pnpm test` (the engine wasm is
# gitignored, produced by the build). This wrapper gives that box a one-command
# path that needs only Docker. The committed engine/wad/phobos.wad keeps the WAD
# toolchain (zdbsp + python) out of the loop, so only emcc is required.
#
# It does NOT change the native path: build-engines.sh still runs as-is under
# emcc-on-PATH (CI, or a dev with emsdk sourced). This is purely the local-dev
# convenience layer around it.
#
# Knobs (forwarded to build-engines.sh):
#   PH_HEADLESS_ONLY=1  build only the headless replay engine (faster; tests need
#                       only this).
#   PH_LIVE_ONLY=1      build only the live SDL engine + the base64 codegen.
#   EMSDK_IMAGE=...     override the toolchain image (default emscripten/emsdk:latest,
#                       which mirrors CI's setup-emsdk@v14 default). Pin a tag here
#                       for a reproducible toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
PKG_DIR="$(pwd)"
IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:latest}"

if ! command -v docker >/dev/null 2>&1; then
  echo "build-engines-docker: docker not found on PATH." >&2
  echo "Install Docker, or source an emsdk env and run scripts/build-engines.sh directly." >&2
  exit 1
fi

# Run as the host uid:gid so build/ + src/generated/ outputs are owned by the
# caller, not root. uid 1000 maps to the image's 'ubuntu' user; any other uid
# still works (emcc's cache dir is world-writable in the image, and HOME=/tmp
# gives a writable home for emcc's first-run sanity file). The prebuilt sysroot
# cache in the image is reused, so the heavy libc/compiler-rt build is skipped.
exec docker run --rm \
  -v "$PKG_DIR":/src \
  -w /src \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e "PH_HEADLESS_ONLY=${PH_HEADLESS_ONLY:-0}" \
  -e "PH_LIVE_ONLY=${PH_LIVE_ONLY:-0}" \
  "$IMAGE" \
  bash scripts/build-engines.sh
