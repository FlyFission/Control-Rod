# Plan: Claude checks are not cut off by a turn cap

1. Count turns and tool calls in the four failed runs' logs (each "error_max_turns" at 9 turns).
2. Replace the qualification-match test with a test that the checker has no turn cap; drop the flag; regenerate the goldens; update docs/daemon.md.
3. Vet for linux and darwin, run the runner tests; PR, merge on green; rerun the checks on the Mac.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Claude checker is no longer cut off by a turn cap before it writes its verdict: the launch passes no --max-turns, and the check deadline bounds the run. A launch test pins it, the launch goldens are regenerated, docs/daemon.md says so, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
