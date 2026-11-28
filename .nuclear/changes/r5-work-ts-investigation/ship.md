# Ship: work.ts investigation

- **Not a split.** `services/api/src/work.ts` is unchanged. The extraction plan is not started.
- **Shipped.** Five characterization tests, the boundary map, and the follow-up plan. Task 3 names `checker-attempts.ts` as the sticky-fail leaf. `queueRun` imports `currentDeliverable`, `hasStickyFail`, and `lockNextOverride` from it. It does not copy them.

## Release decision

Non-trust. Open a pull request. Merge on green CI by the standing mechanics. Do not start the extraction in that pull request.

## Rollback

Revert the squash. The tests, the map, and the plan go away. `work.ts` was not changed, so there is no behavior to restore.

## Monitoring

The typescript CI job runs the API suite, including `test/work-characterization.test.ts`.

## Signature

No trust-surface yes is recorded. None was asked for a file this change writes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The map and the plan are in the tree.
2. `work.ts` is unchanged.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
