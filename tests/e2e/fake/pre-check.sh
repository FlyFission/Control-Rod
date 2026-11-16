#!/usr/bin/env bash
# Scripted pre-check: a structural check that the author produced deliverables.
set -euo pipefail
mkdir -p out
if ls inputs/deliverables/* >/dev/null 2>&1; then
  echo '{"outcome":"pass","findings":[]}' > out/verification.json
else
  echo '{"outcome":"fail","findings":[{"id":"F-001","severity":"major","text":"No deliverables were produced."}]}' > out/verification.json
fi
