# Ship: Settings subscriptions page

Release decision: **draft pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge to main after review.
- **Not claimed:** a desktop browser pass. The page was exercised in jsdom, including axe with the color-contrast rule disabled because jsdom cannot measure pixels. Shared text colors are already covered by `apps/web/src/design/contrast.test.ts`. This change adds no color pair.
- **Not claimed:** macOS or WSL2 execution of the page. Qualification text is computed from the platform name and `CONTROLROD_SEATBELT_QUALIFIED`. It does not enable a launch.

Rollback: revert the merge. The new settings key `subscription_report` can be left in place; nothing else reads it. No migration.

Monitoring after merge: open Settings > Subscriptions on a machine where the daemon is running and confirm the rows match `controlrod` probe logs. A launch on macOS or native Linux must still be refused.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The page and `GET /subscriptions` show only probes the daemon reported for registered provider CLIs. No token field is rendered or stored. Unit tests for the probe and the page pass, and the page's axe scan reports no violations. Existing launch behavior is unchanged.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
