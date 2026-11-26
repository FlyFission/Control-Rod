# Trace: Claude checks are not cut off by a turn cap

| Need | Code | Test |
| --- | --- | --- |
| No turn cap on a checker | `daemon/internal/runner/runtime.go` ClaudeArgs | `checker_test.go` TestClaudeCheckerHasNoTurnCap; `launch_golden_test.go` TestLaunchGolden |
| Docs match | `docs/daemon.md` | review |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Claude checker is no longer cut off by a turn cap before it writes its verdict: the launch passes no --max-turns, and the check deadline bounds the run. A launch test pins it, the launch goldens are regenerated, docs/daemon.md says so, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
