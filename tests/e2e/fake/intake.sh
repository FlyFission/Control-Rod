#!/usr/bin/env bash
# Scripted intake for end-to-end runs. A request for a scope of work becomes two dependent packages;
# anything else gets a direct answer. A real intake agent follows packs/*/roles; this script stands in for it.
set -euo pipefail
mkdir -p out/packages
if ! grep -qi "scope of work" inputs/BRIEF.md; then echo "A short direct answer." > out/answer.md; exit 0; fi
att=$(ls inputs/attachments 2>/dev/null | head -1 || true)
pkg() { # id role title objective deliverable-json inputs-json criteria-json rigor depends-json
  cat > "out/packages/$1.json" <<JSON
{"schema_version":"0.1.0","id":"$1","revision":0,"status":"draft","title":"$3","project":"PRJ-E2E","mode":"capital-projects","discipline":"mechanical","rigor_mode":"$8","data_lane":"internal","objective":"$4","deliverables":$5,"design_inputs":$6,"depends_on":$9,"agent_assignment":[{"role":"$2","agent_baseline":"author","baseline_revision":0}],"acceptance_criteria":$7,"verification":{"method":"agent-pre-check","verifier":"checker","verifier_receives":["deliverables"],"required_custody":{"decisive_evidence_generated_by":"verifier","preparer_may_present":false}}}
JSON
}
inputs='[]'
[ -n "$att" ] && inputs="[{\"doc\":\"attachment:$att\",\"revision\":\"0\",\"use\":\"field data\"}]"
pkg SURVEY general-author "Field survey summary" "Summarize the equipment data and installation details from the owner's notes." '[{"id":"SURVEY-1","type":"report","format":["md"]}]' "$inputs" '["Every equipment value cites the owner notes or is marked owner to supply"]' quick '[]'
pkg SOW general-author "Scope of work" "Draft the scope of work for the replacement from the accepted survey." '[{"id":"SOW-1","type":"report","format":["md"]}]' '[{"doc":"SURVEY","revision":"0","use":"field data"}]' '["Every work item names its owner and its hold points","No number appears that is not in the survey"]' standard '[{"package_id":"SURVEY","reason":"needs the accepted survey"}]'
