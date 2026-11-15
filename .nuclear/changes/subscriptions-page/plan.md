# Plan: Settings subscriptions page

1. Add the subscription report beside the existing runtime probe. Do not run the CLI a second time for it, and do not branch on runtime names outside the adapters.
2. Store the report on claim and serve `GET /subscriptions`. Drop unknown provider ids and any token field.
3. Add the read-only Settings > Subscriptions page, vendor-family badges on author and checker lines, and unit tests including an axe scan in the existing web test run.
4. Regenerate the OpenAPI contract. Do not edit the kernel, policies, red-team tests, or workflows.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The page and `GET /subscriptions` show only probes the daemon reported for registered provider CLIs. No token field is rendered or stored. Unit tests for the probe and the page pass, and the page's axe scan reports no violations. Existing launch behavior is unchanged.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
