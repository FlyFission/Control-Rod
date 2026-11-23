#!/usr/bin/env bash
# Re-run every script from the committed inputs and compare with the committed outputs.
# Exits nonzero on the first mismatch; prints one line per output that matches.
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

check() { # check <dir> <output file> <command...>
  local dir=$1 out=$2; shift 2
  (cd "$dir" && "$@") > "$tmp/out"
  cmp "$tmp/out" "$dir/$out"
  echo "$dir/$out: identical"
}

(cd repos && python3 -B redact.py)
check personas outputs.json python3 -I score.py inputs.json
check repos counts.json python3 -B classify.py
check repos counts_all.json python3 -B classify_all.py
check repos onboarding_counts.json python3 -B onboarding_count.py
check repos top60.json python3 -B top60.py
check repos top60_counts.txt python3 -B tally_top60.py
