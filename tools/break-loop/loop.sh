#!/usr/bin/env bash
# The break loop (a "Ralph loop"): one prompt, run again and again with a fresh agent context, until
# a pass finds nothing new and nothing fixable is open, or the pass limit is reached.
#
#   tools/break-loop/loop.sh                 # up to BREAK_LOOP_MAX passes (default 10)
#   BREAK_LOOP_AGENT='codex exec --full-auto' tools/break-loop/loop.sh
#
# BREAK_LOOP_AGENT is any command that reads a prompt on stdin and works in this checkout. The
# default is Claude Code in print mode. Each pass's transcript goes to tools/break-loop/.state/.
#
# Guard rails the script enforces after every pass, whatever the agent did:
#   - a pass that changed a trust surface (AGENTS.md rule 2) stops the loop and leaves the change
#     uncommitted for a person to read;
#   - a pass that committed nothing and left no STOP counts as idle; two idle passes in a row stop it.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
STATE=tools/break-loop/.state
mkdir -p "$STATE"
rm -f "$STATE/STOP"
MAX=${BREAK_LOOP_MAX:-10}
AGENT=${BREAK_LOOP_AGENT:-claude -p --permission-mode acceptEdits}
TRUST='^(policies/|tests/redteam/|\.github/workflows/|spec/|kernel/)'
idle=0

for pass in $(seq 1 "$MAX"); do
  head_before=$(git rev-parse HEAD)
  log="$STATE/pass-$(date +%Y%m%dT%H%M%S)-$pass.log"
  echo "== break loop pass $pass/$MAX ($log)"
  $AGENT < tools/break-loop/PROMPT.md > "$log" 2>&1
  status=$?
  echo "   agent exited $status"

  touched=$( { git diff --name-only "$head_before" HEAD; git diff --name-only; git diff --name-only --cached; } | sort -u | grep -E "$TRUST" || true)
  if [ -n "$touched" ]; then
    echo "!! pass $pass touched trust surfaces; stopping for a person:"
    echo "$touched" | sed 's/^/     /'
    exit 3
  fi

  if [ -f "$STATE/STOP" ]; then
    echo "== stopped: $(cat "$STATE/STOP")"
    node tools/break-loop/findings.mjs summary
    exit 0
  fi

  if [ "$(git rev-parse HEAD)" = "$head_before" ]; then
    idle=$((idle + 1))
    [ "$idle" -ge 2 ] && { echo "== two passes in a row changed nothing; stopping"; exit 4; }
  else
    idle=0
  fi
done
echo "== reached $MAX passes"
node tools/break-loop/findings.mjs summary
