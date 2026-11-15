# Trace: Settings subscriptions page

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RS-01 The settings page lists only registered provider CLIs, with detection, auth, and per-role qualification. | `daemon/internal/runner/subscriptions.go`; adapters declare family, subscription listing, and author qualification; `GET /subscriptions` | Go tests in `subscriptions_test.go`; API `test/subscriptions.test.ts`; web `subscriptions.test.tsx` | implemented and tested |
| RS-02 No token or API key is read into the page or the stored report. API-key-only CLIs are excluded. | API cleaner; page has no input; `listsSubscription` | Go `TestAuthOfDiscardsStatusOutput` and `TestListsSubscriptionSkipsFakeAndAPIKeyCLIs`; API test drops a planted secret; web test finds no input | implemented and tested |
| RS-03 Checker tiers and the model registry are shown. Safety is 2 from different vendor families; other grades are 1; a local model cannot decide Safety or Material. | Tiers are fixed on the API response. Checkers come from `models.json` via the daemon report. | Go checker assertions; API tier assertions; web checker table | implemented and tested |
| RS-04 Vendor-family badges appear where the UI names who authored or checked. | `VendorBadge` on checker attempts, run cards, and the agent card | `vendor.test.ts`; agent card text | implemented and tested |
| RS-05 The page axe scan is clean and runs with the existing web unit tests. The launch preflight is unchanged. | axe-core in `subscriptions.test.tsx`, color-contrast disabled only because jsdom has no canvas | web test; `TestAnUnpinnedRuntimeThatChangedIsWithdrawnWithoutRunningIt` still expects two CLI runs | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The page and `GET /subscriptions` show only probes the daemon reported for registered provider CLIs. No token field is rendered or stored. Unit tests for the probe and the page pass, and the page's axe scan reports no violations. Existing launch behavior is unchanged.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
