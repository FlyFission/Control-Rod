#!/usr/bin/env bash
# Scripted author: round 1 leaves out the method so the pre-check can catch it; round 2 fixes it.
set -euo pipefail
mkdir -p out
if [ -d inputs/previous ]; then method='"method":"computed from geometry"'; else method='"method":"none"'; fi
if grep -q "site-parcel" inputs/PACKAGE.json; then
  echo "{\"type\":\"Feature\",\"properties\":{\"acres\":\"40.0\",${method}},\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-82.40,34.85],[-82.39,34.85],[-82.39,34.856],[-82.40,34.856],[-82.40,34.85]]]}}" > out/parcel.json
else
  printf '# Next-stage plan\n\n1. Geotechnical investigation. Owner: civil lead. Gate: feasibility.\n' > out/plan.md
fi
