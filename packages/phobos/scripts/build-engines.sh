#!/bin/bash
# Build the Phobos DOOM engines with Emscripten. Two targets from one patched
# doomgeneric fork (engine/): the headless replay artifact (no SDL, exports
# phobos_run) and -- added later -- the live SDL build. Emits to build/.
#
# Requires the emsdk env on PATH: source <emsdk>/emsdk_env.sh
#
# Build-selection knobs (CI/test use these; a bare run builds both):
#   PH_HEADLESS_ONLY=1  build only the headless replay engine (build/phobos-headless.*).
#                       That artifact is all the tests need, so `pretest` uses this to
#                       skip the heavier live SDL build.
#   PH_LIVE_ONLY=1      build only the live SDL engine + the base64 codegen.
set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE=engine
WAD=engine/wad/phobos.wad                    # one shared WAD: live + headless replay
OUT=build
mkdir -p "$OUT"

if [ ! -f "$WAD" ]; then
  echo "Building minimal IWAD..."
  ( cd engine/wad && python3 build-phobos-wad.py && \
    "${ZDBSP:-zdbsp}" phobos-min.wad -o phobos.wad >/dev/null )
fi

# Shared DOOM fork + phobos.c. Each target adds exactly one platform entry.
# Headless: silent stub sound (sim must not depend on audio), no _live.c files.
# Live: real SFX backend (i_sound_phobos_live.c) REPLACES the stub -- drop the
# stub here or the two definitions of the I_* sound symbols collide.
HEADLESS_SRC=$(ls "$ENGINE"/*.c | grep -vE '_live\.c$')
LIVE_SRC=$(ls "$ENGINE"/*.c | grep -vE 'phobos_headless\.c$|i_sound_stub\.c$')

COMMON="-O3 -I $ENGINE --embed-file $WAD@/phobos.wad -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker"

if [ "${PH_LIVE_ONLY:-0}" != "1" ]; then
  echo "[headless] compiling $(echo "$HEADLESS_SRC" | wc -w) files..."
  emcc $COMMON $HEADLESS_SRC \
    -sEXPORT_NAME=PhobosHeadless \
    -sEXPORTED_FUNCTIONS='["_phobos_run","_malloc","_free","_main"]' \
    -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8"]' \
    -o "$OUT/phobos-headless.js"
  echo "[headless] done -> $OUT/phobos-headless.wasm ($(du -h "$OUT/phobos-headless.wasm" | cut -f1))"
fi

if [ "${PH_HEADLESS_ONLY:-0}" != "1" ]; then
  echo "[live] compiling $(echo "$LIVE_SRC" | wc -w) files..."
  emcc $COMMON $LIVE_SRC \
    -sEXPORT_NAME=PhobosLive \
    -sEXPORTED_FUNCTIONS='["_main","_phobos_start","_phobos_frame","_phobos_key","_phobos_fb","_phobos_width","_phobos_height","_phobos_killcount","_phobos_tracelen","_phobos_traceptr","_phobos_leveltime","_phobos_player_dead","_phobos_audio_pull","_phobos_audio_resume","_phobos_set_mute","_malloc","_free"]' \
    -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8","HEAPU32","HEAPF32"]' \
    -o "$OUT/phobos-live.js"
  # Codegen a clean base64 string of the live wasm (engine + WAD) so the live IIFE
  # inlines it as ONE tidy string. (emscripten SINGLE_FILE + esbuild minify mangles
  # the binary into ~717k \xNN escapes, ~1.6x bloat.) game.ts decodes + instantiates;
  # runtime WebAssembly.instantiate(bytes) is allowed in the live iframe (only the
  # replay isolate forbids it).
  mkdir -p src/generated
  printf 'export default "%s";\n' "$(base64 -w0 "$OUT/phobos-live.wasm")" > src/generated/phobos-live-wasm.ts
  echo "[live] done -> $OUT/phobos-live.wasm ($(du -h "$OUT/phobos-live.wasm" | cut -f1)) + b64"
fi
