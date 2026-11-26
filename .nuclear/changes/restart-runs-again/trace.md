# Trace: A run Control Rod stopped to restart runs again on its own

| Need | Code | Test |
| --- | --- | --- |
| Restarted runs come back | `services/api/src/work.ts` retryFailedRun | `test/signing-policy.test.ts` "runs an author run again on its own when Control Rod stopped it to restart" |
| Column picks followed | `services/api/src/work.ts` claim | `test/signing-policy.test.ts` "follows the board's column picks" |
| Unassigned icon wording | `apps/web/src/features/board/Card.tsx` agentWord | web typecheck |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under a signed policy that releases cards on its own, an author or check run that the daemon stopped because it was shutting down (an update or restart) is settled and queued again by the policy, every time, with the reason recorded; an author run that failed for any other reason still stops for the person. Column picks are followed for routine cards (test). A not-yet-assigned run's icon says the first free agent takes it. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
