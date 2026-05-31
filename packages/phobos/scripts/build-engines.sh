#!/bin/bash
# Build the Phobos DOOM engines with Emscripten. Two targets from one patched
# doomgeneric fork (engine/): the headless replay artifact (no SDL, exports
# phobos_run) and -- added later -- the live SDL build. Emits to build/.
#
# Requires the emsdk env on PATH: source <emsdk>/emsdk_env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE=engine
WAD=engine/wad/phobos.wad
OUT=build
mkdir -p "$OUT"

if [ ! -f "$WAD" ]; then
  echo "Building minimal IWAD..."
  ( cd engine/wad && python3 build-phobos-wad.py && \
    "${ZDBSP:-zdbsp}" phobos-min.wad -o phobos.wad >/dev/null )
fi

# Shared DOOM fork + phobos.c. Each target adds exactly one platform entry.
HEADLESS_SRC=$(ls "$ENGINE"/*.c | grep -vE '_live\.c$')
LIVE_SRC=$(ls "$ENGINE"/*.c | grep -vE 'phobos_headless\.c$')

COMMON="-O3 -I $ENGINE --embed-file $WAD@/phobos.wad -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker"

echo "[headless] compiling $(echo "$HEADLESS_SRC" | wc -w) files..."
emcc $COMMON $HEADLESS_SRC \
  -sEXPORT_NAME=PhobosHeadless \
  -sEXPORTED_FUNCTIONS='["_phobos_run","_malloc","_free","_main"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8"]' \
  -o "$OUT/phobos-headless.js"
echo "[headless] done -> $OUT/phobos-headless.wasm ($(du -h "$OUT/phobos-headless.wasm" | cut -f1))"

echo "[live] compiling $(echo "$LIVE_SRC" | wc -w) files..."
emcc $COMMON $LIVE_SRC \
  -sEXPORT_NAME=PhobosLive \
  -sEXPORTED_FUNCTIONS='["_main","_phobos_start","_phobos_frame","_phobos_key","_phobos_fb","_phobos_width","_phobos_height","_phobos_killcount","_phobos_tracelen","_phobos_traceptr","_phobos_leveltime","_phobos_player_dead","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8","HEAPU32"]' \
  -o "$OUT/phobos-live.js"
# Codegen a clean base64 string of the live wasm (engine + WAD) so the live IIFE
# inlines it as ONE tidy string. (emscripten SINGLE_FILE + esbuild minify mangles
# the binary into ~717k \xNN escapes, ~1.6x bloat.) game.ts decodes + instantiates;
# runtime WebAssembly.instantiate(bytes) is allowed in the live iframe (only the
# replay isolate forbids it).
mkdir -p src/generated
printf 'export default "%s";\n' "$(base64 -w0 "$OUT/phobos-live.wasm")" > src/generated/phobos-live-wasm.ts
echo "[live] done -> $OUT/phobos-live.wasm ($(du -h "$OUT/phobos-live.wasm" | cut -f1)) + b64"
