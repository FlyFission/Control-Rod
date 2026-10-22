#!/usr/bin/env bash
# Scripted intake for end-to-end tests: a site request becomes two packages, anything else an answer.
set -euo pipefail
mkdir -p out/packages
if grep -qi "site a" inputs/BRIEF.md; then
  att=$(ls inputs/attachments 2>/dev/null | head -1)
  common='"schema_version":"0.1.0","revision":0,"status":"draft","project":"BM-E2E","mode":"capital-projects","rigor_mode":"standard","data_lane":"internal","agent_assignment":[{"role":"ROLE","agent_baseline":"author","baseline_revision":0}],"verification":{"method":"agent-pre-check","verifier":"checker","verifier_receives":["deliverables"],"required_custody":{"decisive_evidence_generated_by":"verifier","preparer_may_present":false}}'
  echo "{${common/ROLE/site-parcel},\"id\":\"PARCEL\",\"title\":\"Parcel resolution\",\"objective\":\"Resolve the parcel boundary and acreage from the owner's file.\",\"deliverables\":[{\"id\":\"PARCEL-1\",\"type\":\"geojson\",\"format\":[\"json\"]}],\"design_inputs\":[{\"doc\":\"attachment:${att}\",\"revision\":\"0\",\"use\":\"boundary\"}],\"acceptance_criteria\":[\"Boundary is a closed polygon\",\"Acreage is computed from the geometry\"]}" > out/packages/PARCEL.json
  echo "{${common/ROLE/general-author},\"id\":\"PLAN\",\"title\":\"Next-stage work package plan\",\"objective\":\"List the feasibility deliverables for this site.\",\"deliverables\":[{\"id\":\"PLAN-1\",\"type\":\"report\",\"format\":[\"md\"]}],\"design_inputs\":[{\"doc\":\"PARCEL\",\"revision\":\"0\",\"use\":\"boundary\"}],\"acceptance_criteria\":[\"Every deliverable has an owner and a gate\"]}" > out/packages/PLAN.json
else
  echo "A short direct answer." > out/answer.md
fi
