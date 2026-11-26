# Basis: Claude checks are not cut off by a turn cap

After #238, a real Claude check on the owner's Mac wrote its verdict for a one-line diff, but the three card checks (R-06bb1999, R-580eeadb, R-3c0e89d6), and the earlier R-75c1c88f, each ended with the result line "error_max_turns" at num_turns 9. They had made 8 assistant messages and 10 to 13 tool calls, reading the brief, the criteria and the deliverables, and none had written a verdict yet. Those counts come from the run logs in the owner's Control Rod. The bound of 8 had been copied from the launch qualification's fixture run, which bounds a scripted provider, not a real review. The check deadline already stops a stalled checker (API test "stops a stalled check at its deadline").

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Claude checker is no longer cut off by a turn cap before it writes its verdict: the launch passes no --max-turns, and the check deadline bounds the run. A launch test pins it, the launch goldens are regenerated, docs/daemon.md says so, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
