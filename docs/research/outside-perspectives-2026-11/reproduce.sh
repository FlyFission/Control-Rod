#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cp outputs.json "$tmp"
python3 evaluate.py >/dev/null
cmp -s "$tmp" outputs.json && echo "outputs.json: identical"
# sha256sum is not on macOS; shasum -a 256 is, and reads the same list.
if command -v sha256sum >/dev/null 2>&1; then sha256sum -c SHA256SUMS; else shasum -a 256 -c SHA256SUMS; fi
