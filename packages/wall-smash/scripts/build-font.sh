#!/bin/bash
# Regenerate the in-game Bevy UI font: assets/ui-font.subset.ttf.
#
# The live build renders its HUD + screens with Bevy's own text engine, so it needs a
# font with glyphs for every language the screens show (11 locales: Latin, Cyrillic,
# Arabic, and CJK for zh/ja/ko). A full multi-script Noto set is tens of MB; we only
# render a handful of short strings, so this subsets each Noto source down to exactly
# the glyphs those strings use and MERGES them into one small static TTF the wasm
# bakes via include_bytes!.
#
# This is a DEVELOPER step, run when the rendered screen strings change - NOT part of
# the wasm build or CI (the committed assets/ui-font.subset.ttf is the build input).
# Re-run it after editing .caputchin/locales.json's screen strings, then rebuild wasm.
#
# Requires: fonttools (pyftsubset, pyftmerge, fonttools varLib.instancer) and the five
# Noto source TTFs in $WS_FONT_SRC (default /tmp/wsfont):
#   NotoSans-Regular.ttf  NotoSansArabic.ttf  (cosmic-text crate ships these)
#   NotoSansSC.ttf  NotoSansJP.ttf  NotoSansKR.ttf  (github.com/google/fonts, OFL)
# All are SIL OFL 1.1; see THIRD-PARTY-NOTICES.md.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${WS_FONT_SRC:-/tmp/wsfont}"
OUT="assets/ui-font.subset.ttf"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p assets

# The glyph set: every character the Bevy SCREENS render. That is the 8 screen-text
# keys across all presets (the announcer + aria strings are spoken via the DOM, in the
# browser's own fonts, so they are NOT baked here) plus ASCII printable (HUD digits,
# the score / time / level readouts, punctuation, the {level} number).
python3 - "$WORK/glyphs.txt" <<'PY'
import json, sys
SCREEN_KEYS = ["startPrompt","levelToast","winTitle","winBody","keepPlaying","loseTitle","loseBody","tryAgain"]
chars = set(chr(c) for c in range(0x20, 0x7f))  # ASCII printable (digits/punct/Latin)
data = json.load(open(".caputchin/locales.json", encoding="utf-8"))
for preset in data["presets"].values():
    for k in SCREEN_KEYS:
        chars.update(preset.get(k, ""))
open(sys.argv[1], "w", encoding="utf-8").write("".join(sorted(chars)))
print(f"[build-font] glyph set: {len(chars)} chars")
PY

# Subset one source font to the glyph set. Variable sources (CJK) are first pinned to
# the Regular weight so the merged output is a single static face. Keep ALL layout
# features so Arabic cursive shaping (init/medi/fina) survives.
subset_one() { # $1 src ttf, $2 out ttf
  local src="$1" out="$2" inst="$WORK/inst_$(basename "$1")"
  # Pin EVERY variation axis to its default so the result is fully static (pinning
  # only one axis on a multi-axis VF leaves a VarStore that breaks the later merge).
  if python3 - "$src" "$inst" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont(sys.argv[1])
if "fvar" in f:
    instancer.instantiateVariableFont(
        f, {a.axisTag: a.defaultValue for a in f["fvar"].axes}, inplace=True
    )
    f.save(sys.argv[2])
else:
    raise SystemExit(1)  # static already -> caller uses the original
PY
  then
    src="$inst"
  fi
  pyftsubset "$src" \
    --text-file="$WORK/glyphs.txt" \
    --output-file="$out" \
    --layout-features='*' \
    --ignore-missing-unicodes \
    --no-hinting --desubroutinize \
    --drop-tables+=DSIG,BASE,STAT,vhea,vmtx,VVAR,HVAR,MVAR,gasp
}

# Order matters: the FIRST font owning a codepoint wins the merge. NotoSans owns
# ASCII/Latin/Cyrillic; Arabic next; then the CJK faces (shared Han -> SC wins, which
# is fine for the few Han chars; kana is JP-only, Hangul is KR-only, both unique).
i=0
parts=()
for f in NotoSans-Regular.ttf NotoSansArabic.ttf NotoSansSC.ttf NotoSansJP.ttf NotoSansKR.ttf; do
  if [ ! -f "$SRC/$f" ]; then
    echo "[build-font] MISSING $SRC/$f - see header for sources" >&2
    exit 1
  fi
  part="$WORK/sub_$i.ttf"
  subset_one "$SRC/$f" "$part"
  parts+=("$part")
  i=$((i + 1))
done

pyftmerge --output-file="$OUT" "${parts[@]}"

# Blank the .notdef glyph (keep its advance) so any unexpected missing codepoint
# renders as empty space, never the tofu box NotoSans ships as glyph 0. Our coverage
# is complete, but some shapers still emit a leading notdef; this makes that invisible.
python3 - "$OUT" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph
f = TTFont(sys.argv[1])
name = f.getGlyphName(0)
g = Glyph()
g.numberOfContours = 0
f["glyf"][name] = g
f.save(sys.argv[1])
PY

echo "[build-font] wrote $OUT ($(du -h "$OUT" | cut -f1))"
