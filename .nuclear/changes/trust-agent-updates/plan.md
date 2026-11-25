# Plan: trust agent updates

1. Capture Codex 0.172.0's real feature list (npm package) as test data; it turns on `mcp_lazy_stdio_startup`, which 0.171.0 left off.
2. Codex preflight returns switches (`PreflightSwitches`), verified by a second listing; status, workspace and launch carry them; a launch whose switches differ from the current preflight is refused. Callers that cannot carry switches (`Preflight`, `PreflightCLI`) still refuse.
3. Replace the exact Antigravity and Grok pins with a tested-floor comparison (`agent_version.go`) and a note for newer builds.
4. Update docs/daemon.md.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-05 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
