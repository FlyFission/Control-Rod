#!/usr/bin/env bash
# Check the package lifecycle model and regenerate its conformance traces (PL1, PL2).
#
#   bash models/generate.sh            check, simulate, and rewrite the traces
#   bash models/generate.sh --check    check and simulate only; write nothing
#
# Quint is pinned here and fetched by npx; it is not a repository dependency. Set QUINT
# to a quint binary of the same version to skip the fetch. The typescript backend is
# used so that no evaluator is downloaded. Nothing here is a proof: the simulator samples
# runs and reports the violations it finds.
set -euo pipefail

QUINT_VERSION="0.33.1"
QUINT="${QUINT:-npx -y @informalsystems/quint@${QUINT_VERSION}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="models/package-lifecycle.qnt"
OUT="models/traces/package-lifecycle/v1"
# Simulation and trace parameters. Changing them changes the traces; record why.
SEED="1"
CHECK_SAMPLES="5000"
TRACES="32"
STEPS="30"
INVARIANTS="HumanActsSigned AgentWorkByAgents PreCheckIndependent ReviseAfterNonPass AcceptanceHasPreCheck EnrolledReleaseReady TerminalIsFinal OutcomeShape"
WITNESSES="ReachedAccepted ReachedClosed RefusedNotIndependent PreCheckAllowedAfterOverride RevisedAfterFail"

cd "$ROOT"
version="$($QUINT --version)"
if [ "$version" != "$QUINT_VERSION" ]; then
  echo "quint $version found; this script is pinned to $QUINT_VERSION" >&2
  exit 1
fi
# sha256sum is not on macOS; shasum -a 256 is, and prints the same.
if command -v sha256sum >/dev/null 2>&1; then sha256() { sha256sum "$@"; }; else sha256() { shasum -a 256 "$@"; }; fi
echo "quint $version, model sha256 $(sha256 "$MODEL" | cut -d' ' -f1)"

$QUINT typecheck "$MODEL"
$QUINT test "$MODEL" --backend typescript
# shellcheck disable=SC2086
$QUINT run "$MODEL" --backend typescript --seed "$SEED" \
  --max-samples "$CHECK_SAMPLES" --max-steps "$STEPS" \
  --invariants $INVARIANTS --witnesses $WITNESSES --verbosity 1

if [ "${1:-}" = "--check" ]; then
  exit 0
fi

itf="$(mktemp -d)"
trap 'rm -rf "$itf"' EXIT
command="quint run $MODEL --backend typescript --seed $SEED --max-samples $TRACES --n-traces $TRACES --max-steps $STEPS"
$QUINT run "$MODEL" --backend typescript --seed "$SEED" \
  --max-samples "$TRACES" --n-traces "$TRACES" --max-steps "$STEPS" \
  --out-itf "$itf/run_{seq}.itf.json" --verbosity 0
python3 -I models/itf_to_traces.py --itf-dir "$itf" --out "$OUT" --model "$MODEL" \
  --model-name "$MODEL" --seed "$SEED" --tool-version "$version" --command "$command"
