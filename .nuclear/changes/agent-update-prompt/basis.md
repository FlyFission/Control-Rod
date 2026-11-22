# Basis: agent update prompt

**Change slug:** `agent-update-prompt`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-22
**Decision this basis supports:** whether the daemon may tell the person, at startup, which agent CLIs have a newer version, and install one when the person asks.

## Mission / need

The owner asked (2026-11-22) for the startup prompt Orchestrator (agent-orchestrator, Apache-2.0) shows: each connected agent CLI with its installed and latest version, an Update per agent and an Update all. Outdated CLIs miss bug fixes and new models, and keeping five of them current by hand is one more terminal to juggle.

## What this change does

- `controlrod daemon` checks once at startup, in the background, and logs one line naming each outdated agent. It never installs. `--no-update-check` or `CONTROLROD_UPDATE_CHECK=0` turns the check off.
- `controlrod agents` prints every built-in agent found on PATH with installed and latest version and the exact command an update would run.
- `controlrod agents update [agent...]` shows each command and asks before running it; `--all` shows every command and asks once; `--yes` is for a person who has read them.
- Latest versions come from the npm registry (`CONTROLROD_NPM_REGISTRY` for a mirror). Only a CLI installed by npm from the package the catalog names gets a command (`npm install --global <package>@<version>`); a Homebrew or native install is reported with its path and left alone. Antigravity has no known public package, so its latest version is not checked.

## Not in this change

A panel in the web app. The daemon reports runtime status through `Runner.RuntimeStatus` in `spec/api.tsp`; showing the latest version and taking an Update click in the browser needs that contract extended and a daemon command the browser can request. Both wait for the owner's decision on the spec change.

The idea is Orchestrator's; no code was copied (THIRD_PARTY_NOTICES.md).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-04 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
