#!/usr/bin/env bash
# Emit the per-game CI matrix for the games CHANGED in this push/PR (plus a
# shared-change catch-all). CI-owned: stack is classified by intrinsic files,
# nothing in package.json / caputchin.json declares it.
#
# Writes to $GITHUB_OUTPUT (falls back to stdout for local dry-runs):
#   matrix    = {"include":[{"game","pkg","stack"}, ...]}   (object form; never a bare [])
#   has_games = "true" | "false"
#
# Stack convention: Cargo.toml -> rust ; C/C++ engine source -> emscripten ; else js.
set -euo pipefail
cd "$(dirname "$0")/../.."

EMPTY_TREE="$(git hash-object -t tree /dev/null)"

# --- resolve the diff base ---------------------------------------------------
# PR: merge-base of the target branch and HEAD, so the diff is what the PR adds.
# push: the previous tip; the empty tree on a first push / vanished force-push
# tip, which makes every tracked path "changed" -> full fan-out (safe default).
if [ "${GITHUB_EVENT_NAME:-}" = "pull_request" ]; then
  git fetch --no-tags --depth=50 origin "${GITHUB_BASE_REF:?GITHUB_BASE_REF required on PR}" >/dev/null 2>&1 || true
  BASE="$(git merge-base "origin/${GITHUB_BASE_REF}" HEAD 2>/dev/null || echo "$EMPTY_TREE")"
else
  BEFORE="${GITHUB_EVENT_BEFORE:-}"
  if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then
    BASE="$EMPTY_TREE"
  else
    BASE="$BEFORE"
  fi
fi
CHANGED="$(git diff --name-only "$BASE" HEAD)"

# --- discover real game packages (dirs with a package.json) ------------------
games=()
for d in packages/*/; do
  [ -f "${d}package.json" ] || continue
  games+=("$(basename "$d")")
done

# --- shared-change catch-all (deny-by-default) -------------------------------
# Any changed path outside a game dir and outside the docs allowlist (lockfile,
# root config, workflows, the detect script, root caputchin.json, ...) forces
# ALL games, so an unrecognized root change can never silently skip CI.
docs_allow='(\.md$|^LICENSE$|TRADEMARK\.md$|\.png$|^docs/|^examples/)'
shared=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    packages/*) : ;;
    *) printf '%s\n' "$f" | grep -qE "$docs_allow" || shared=1 ;;
  esac
done <<< "$CHANGED"

# --- compute the changed game set --------------------------------------------
declare -A changed=()
if [ "$shared" = "1" ]; then
  for g in "${games[@]}"; do changed["$g"]=1; done
else
  while IFS= read -r f; do
    case "$f" in
      packages/*/*)
        g="$(printf '%s' "$f" | cut -d/ -f2)"
        for gg in "${games[@]}"; do [ "$gg" = "$g" ] && changed["$g"]=1; done
        ;;
    esac
  done <<< "$CHANGED"
fi

# --- classify stack + assemble the matrix ------------------------------------
classify() {
  if [ -f "packages/$1/Cargo.toml" ]; then
    echo rust
  elif find "packages/$1" -name node_modules -prune -o \( -name '*.c' -o -name '*.cpp' \) -print 2>/dev/null | grep -q .; then
    echo emscripten
  else
    echo js
  fi
}
items=()
for g in "${games[@]}"; do
  [ "${changed[$g]:-0}" = "1" ] || continue
  pkg="$(grep -m1 '"name"' "packages/$g/package.json" | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  items+=("{\"game\":\"$g\",\"pkg\":\"$pkg\",\"stack\":\"$(classify "$g")\"}")
done

inc="$(IFS=,; echo "${items[*]:-}")"
matrix="{\"include\":[$inc]}"
[ "${#items[@]}" -gt 0 ] && has_games=true || has_games=false

{
  echo "matrix=$matrix"
  echo "has_games=$has_games"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "detect-games: base=${BASE:0:12} shared=$shared -> $matrix" >&2
