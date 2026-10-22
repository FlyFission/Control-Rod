#!/usr/bin/env bash
# Scripted author: runs the same cr-site commands a real agent is told to run.
set -euo pipefail
mkdir -p out
role=$(python3 -c "import json;print(json.load(open('inputs/PACKAGE.json'))['agent_assignment'][0]['role'])")
dep() { ls inputs/deps/*/"$1" 2>/dev/null | head -1; }
case "$role" in
  site-parcel) cr-site parcel resolve --input "inputs/attachments/$(ls inputs/attachments | head -1)" --out out/parcel.json ;;
  site-constraints) cr-site constraints --parcel "$(dep parcel.json)" --out out/constraints.json ;;
  site-charter)
    cp "$SITE_PACK/templates/charter.md" out/charter.md
    cp "$SITE_PACK/templates/basis-of-design.md" out/basis-of-design.md
    cp "$SITE_PACK/examples/program.example.json" out/program.json ;;
  site-plan)
    cr-site layout --parcel "$(dep parcel.json)" --constraints "$(dep constraints.json)" --program "$(dep program.json)" --out out/layout.json
    cp "$SITE_PACK/examples/plan-meta.example.json" out/plan-meta.json
    cr-site plan --parcel "$(dep parcel.json)" --constraints "$(dep constraints.json)" --layout out/layout.json --program "$(dep program.json)" --record out/plan-meta.json --out-dir out/ ;;
  site-next-stage) cp "$SITE_PACK/templates/next-stage-plan.md" out/next-stage-plan.md ;;
  *) printf '# Report\n\nDone.\n' > out/report.md ;;
esac
