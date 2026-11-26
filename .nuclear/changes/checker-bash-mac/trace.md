# Trace: Claude checks on a Mac can run commands and write their verdict

| Need | Code | Test |
| --- | --- | --- |
| Bash works in a Mac checker | `daemon/internal/runner/checker.go` setCheckerTmpEnv | `checker_test.go` TestCheckerTmpEnvPointsClaudeCodeAtTheRunFolder |
| The verdict can be written | `daemon/internal/runner/runtime.go` CheckerPrompt | `launch_golden_test.go` TestLaunchGolden (regenerated fixtures) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker can run its read-only Bash commands and write its verdict: the checker environment points CLAUDE_CODE_TMPDIR and TMPDIR at the per-run folder, and the checker prompt says both verdict files already exist and must be read before they are written. A unit test pins the environment, the launch goldens are regenerated, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
