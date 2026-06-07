#!/usr/bin/env bash
# Wait for jsDelivr to propagate the just-published npm versions before the
# production marketplace index runs, so the indexer resolves the EXACT new
# version (not the mutable @latest tag it falls back to while jsDelivr lags).
#
# Input ($1): the release-please `paths_released` JSON array, e.g.
#   ["packages/wall-smash","packages/voidshot"]
#
# For each released package, poll jsDelivr's resolved endpoint (the same surface
# the marketplace indexer reads) until it reports the version this checkout's
# package.json declares (the just-released bump). Bounded to ~5 min per package
# (TRIES x SLEEP). On timeout it does NOT fail: the npm publish already
# succeeded and the daily cron re-pins, so the index call proceeds with whatever
# jsDelivr has (worst case the mutable @latest).
set -euo pipefail
cd "$(dirname "$0")/../.."

paths_json="${1:-[]}"
mapfile -t paths < <(printf '%s' "$paths_json" | jq -r '.[]')

if [ "${#paths[@]}" -eq 0 ]; then
  echo "await-jsdelivr: no released paths; nothing to wait for"
  exit 0
fi

TRIES=30
SLEEP=10

for path in "${paths[@]}"; do
  pkgjson="$path/package.json"
  if [ ! -f "$pkgjson" ]; then
    echo "await-jsdelivr: WARN missing $pkgjson; skipping"
    continue
  fi
  name="$(jq -r '.name' "$pkgjson")"
  want="$(jq -r '.version' "$pkgjson")"
  echo "await-jsdelivr: waiting for $name@$want on jsDelivr..."
  ok=0
  for i in $(seq 1 "$TRIES"); do
    got="$(curl -fsS "https://data.jsdelivr.com/v1/packages/npm/$name/resolved" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true)"
    if [ "$got" = "$want" ]; then
      echo "  propagated: $name@$got (try $i)"
      ok=1
      break
    fi
    echo "  try $i/$TRIES: jsDelivr has '${got:-none}', want '$want'; sleeping ${SLEEP}s"
    sleep "$SLEEP"
  done
  [ "$ok" = "1" ] || echo "await-jsdelivr: WARN $name@$want not visible after $((TRIES * SLEEP))s; proceeding (cron will re-pin)"
done

echo "await-jsdelivr: done"
