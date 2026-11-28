# Trace: Typed failure reasons and one safe retry for author runs

| Need | Code | Test |
| --- | --- | --- |
| Each daemon error maps to its fixed kind; others none | `daemon.go` failKind | `failkind_test.go` TestFailKind |
| Kind stored on a failed run | `work.ts` applyCompletion | `signing-policy.test.ts` "runs an author run again once when its agent quit..." |
| One retry for exited with containment, not twice | `work.ts` retryFailedRun | same |
| No retry for timeout, breaker, unplaced error, no containment | same | "does not run an author run again for a timeout, the breaker..." |
| Unknown kind refused, no retry | Run.json schema | "refuses a completion with a failure kind the daemon does not know..." |
| Existing restart and failed-check retries unchanged | same | "runs an author run again on its own when Control Rod stopped it to restart", "runs a check that failed without a verdict again once" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every failed run the daemon can place carries a fixed failure kind, taken from the daemon's own error values. An author run whose agent quit with an error, or that the daemon stopped after losing contact, runs again once on its own under a signing policy that lets cards run. That holds only when the daemon accounted for its processes. Every other failure stops for the person as before. API and Go tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
