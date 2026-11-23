# Acceptance trace

| ID | Claim | Evidence |
| --- | --- | --- |
| T-01 | The authenticated active-run list respects run and subject ownership. | API integration test with owned package, owned capture, other organization, mismatched ownership, and terminal state fixtures. |
| T-02 | Developers can switch to the exact run from the shell and recover a finished attempt while its revision is current. | Chromium browser test exercises two run IDs, reload, missing ID, refresh failure and Escape. |
| T-03 | Today shows recorded run states. | Web test keeps the list available when the package read fails and excludes a package-stage proxy. |

## Required links

[basis](basis.md), [risk](risk.md), [plan](plan.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Demonstrate correct run scope and exact attempt navigation. Record the local test results for the owner.

## Source-lineage note

Local change evidence. Inspiration from the pinned workbench donor review and Multica public documentation. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
