#!/usr/bin/env bash
# Scripted author: fills the job pack's templates and examples the way a real agent is told to,
# and writes a short report when the job carries none.
set -euo pipefail
mkdir -p out
shopt -s nullglob
filled=0
for t in inputs/pack/templates/*; do cp "$t" "out/$(basename "$t")"; filled=1; done
for e in inputs/pack/examples/*.example.*; do
  b=$(basename "$e")
  cp "$e" "out/${b/.example/}"
  filled=1
done
[ "$filled" = 1 ] || printf '# Report\n\nDone.\n' > out/report.md
