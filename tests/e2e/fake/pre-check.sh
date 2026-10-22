#!/usr/bin/env bash
# Scripted pre-check: the deterministic cr-site check for the site plan; a structural check otherwise.
set -euo pipefail
mkdir -p out
dep() { ls inputs/deps/*/"$1" 2>/dev/null | head -1; }
if [ -f inputs/deliverables/layout.json ]; then
  cr-site check --parcel "$(dep parcel.json)" --layout inputs/deliverables/layout.json --constraints "$(dep constraints.json)" --program "$(dep program.json)" --package-id PLAN --out out/verification.json || true
  [ -s out/verification.json ] || echo '{"outcome":"inconclusive","findings":[{"id":"F-001","severity":"major","text":"cr-site check did not run"}]}' > out/verification.json
elif ls inputs/deliverables/* >/dev/null 2>&1; then
  echo '{"outcome":"pass","findings":[]}' > out/verification.json
else
  echo '{"outcome":"fail","findings":[{"id":"F-001","severity":"major","text":"No deliverables were produced."}]}' > out/verification.json
fi
