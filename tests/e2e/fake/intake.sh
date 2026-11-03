#!/usr/bin/env bash
# Scripted intake for end-to-end runs. A site request becomes the five site packages; anything
# else gets a direct answer. A real intake agent follows packs/*/roles; this script stands in for it.
set -euo pipefail
mkdir -p out/packages
if ! grep -qi "site a" inputs/BRIEF.md; then echo "A short direct answer." > out/answer.md; exit 0; fi
att=$(ls inputs/attachments 2>/dev/null | head -1)
pkg() { # id role title objective deliverable-json inputs-json criteria-json rigor
  cat > "out/packages/$1.json" <<JSON
{"schema_version":"0.1.0","id":"$1","revision":0,"status":"draft","title":"$3","project":"BM-E2E","mode":"capital-projects","discipline":"site","rigor_mode":"$8","data_lane":"internal","objective":"$4","deliverables":$5,"design_inputs":$6,"agent_assignment":[{"role":"$2","agent_baseline":"author","baseline_revision":0}],"acceptance_criteria":$7,"verification":{"method":"agent-pre-check","verifier":"checker","verifier_receives":["deliverables"],"required_custody":{"decisive_evidence_generated_by":"verifier","preparer_may_present":false}}}
JSON
}
dep() { printf '{"doc":"%s","revision":"0","use":"%s"}' "$1" "$2"; }
pkg PARCEL site-parcel "Parcel resolution" "Resolve the boundary and acreage from the owner's file." '[{"id":"PARCEL-1","type":"geojson","format":["json"]}]' "[{\"doc\":\"attachment:$att\",\"revision\":\"0\",\"use\":\"boundary\"}]" '["Boundary is a closed polygon","Acreage is computed by cr-example"]' quick
pkg CONSTRAINTS site-constraints "Site constraints screen" "Screen flood, wetlands, slope and utilities from public GIS." '[{"id":"CON-1","type":"data","format":["json"]}]' "[$(dep PARCEL boundary)]" '["Every fact has a source and retrieval time","Failed queries are holds"]' quick
pkg CHARTER site-charter "Project charter and basis of design" "Draft the charter and owner requirements for a facility." '[{"id":"CH-1","type":"report","format":["md","json"]}]' '[]' '["Charter names sponsor, owner and decision authority","Every program value is an assumption or confirmed"]' quick
pkg PLAN site-plan "Concept site plan" "Lay out the facility and draw the concept site plan." '[{"id":"PLAN-1","type":"drawing","format":["pdf","dxf","json"]}]' "[$(dep PARCEL boundary),$(dep CONSTRAINTS constraints),$(dep CHARTER program)]" '["Blocks lie inside the buildable area","Sheet carries title block and notes column","cr-example check passes"]' standard
pkg NEXT site-next-stage "Next-stage work package plan" "List the feasibility deliverables, interfaces and holds." '[{"id":"NEXT-1","type":"report","format":["md"]}]' "[$(dep PLAN plan)]" '["Every deliverable has an owner and a gate"]' quick
