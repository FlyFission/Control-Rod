#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cp outputs.json "$tmp"
python3 evaluate.py >/dev/null
cmp -s "$tmp" outputs.json && echo "outputs.json: identical"
sha256sum -c SHA256SUMS
