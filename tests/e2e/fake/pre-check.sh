#!/usr/bin/env bash
# Scripted pre-check: fails output that does not say how acreage was computed.
set -euo pipefail
mkdir -p out
if grep -rqs '"method":"none"' inputs/deliverables; then
  echo '{"outcome":"fail","findings":[{"id":"F-001","severity":"major","text":"Acreage is stated but not computed from the boundary geometry."}]}' > out/verification.json
else
  echo '{"outcome":"pass","findings":[]}' > out/verification.json
fi
