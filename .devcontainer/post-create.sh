#!/usr/bin/env bash
# Runs once when the dev container is created. Leaves the repository ready for `pnpm cr start`.
set -euo pipefail
cd "$(dirname "$0")/.."

# uv is pinned in mise.toml; install the same version.
if ! uv --version 2>/dev/null | grep -q "0.11.32"; then
  pip install --quiet "uv==0.11.32"
fi

# The agent sandbox preflight wants bubblewrap and socat. Best effort: some containers have no sudo.
if command -v apt-get >/dev/null 2>&1; then
  SUDO=""
  [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
  if [ "$(id -u)" -eq 0 ] || [ -n "$SUDO" ]; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y -qq bubblewrap socat >/dev/null \
      || echo "note: could not install bubblewrap and socat; agent runs will be refused until they are present"
  fi
fi

pnpm install --frozen-lockfile
# Build the web app, API and daemon now so the first `pnpm cr start` is quick.
node scripts/cr.mjs setup

echo
echo "Ready. Start Control Rod with:   pnpm cr start"
echo "Check your setup any time with:  pnpm cr doctor"
echo "Real agent runs need Claude Code signed in (npm i -g @anthropic-ai/claude-code, then claude)."
