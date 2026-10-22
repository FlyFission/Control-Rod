#!/usr/bin/env bash
# Scripted author: runs the same cr-example commands a real agent is told to run.
set -euo pipefail
mkdir -p out
role=$(python3 -c "import json;print(json.load(open('inputs/PACKAGE.json'))['agent_assignment'][0]['role'])")
dep() { ls inputs/deps/*/"$1" 2>/dev/null | head -1; }
case "$role" in
  site-parcel) cr-example parcel resolve --input "inputs/attachments/$(ls inputs/attachments | head -1)" --out out/parcel.json ;;
  site-constraints) cr-example constraints --parcel "$(dep parcel.json)" --out out/constraints.json ;;
  site-charter)
    cp "inputs/pack/templates/charter.md" out/charter.md
    cp "inputs/pack/templates/basis-of-design.md" out/basis-of-design.md
    cp "inputs/pack/examples/program.example.json" out/program.json ;;
  site-plan)
    cr-example layout --parcel "$(dep parcel.json)" --constraints "$(dep constraints.json)" --program "$(dep program.json)" --out out/layout.json
    cp "inputs/pack/examples/plan-meta.example.json" out/plan-meta.json
    cr-example plan --parcel "$(dep parcel.json)" --constraints "$(dep constraints.json)" --layout out/layout.json --program "$(dep program.json)" --record out/plan-meta.json --out-dir out/ ;;
  site-next-stage) cp "inputs/pack/templates/next-stage-plan.md" out/next-stage-plan.md ;;
  *) printf '# Report\n\nDone.\n' > out/report.md ;;
esac
