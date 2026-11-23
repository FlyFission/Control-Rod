# Acceptance trace

| ID | Claim | Implementation | Evidence |
| --- | --- | --- | --- |
| T-01 | The default view prioritizes triage. | Workspace and view options group secondary controls. The card emphasizes the title, next step and blocker. | Shell and lens unit suites. Desktop browser flow. |
| T-02 | All stages are reachable. | The grid fits at the standard desktop test width and adds stage navigation when it scrolls. | Desktop browser flow at wide and narrower widths. |
| T-03 | Refusals remain legible and reachable. | The action menu opens outside the stage scroller and returns focus to its trigger. | Browser flow and axe checks. |
| T-04 | Filters surface hidden review work. | The guard counts both protected stages. Clear filters restores the current view. | Lens unit suite and browser search case. |

## Required links

[basis](basis.md), [risk](risk.md), [plan](plan.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Review the desktop board and record unit, build and browser evidence.

## Source-lineage note

Repository change-control evidence. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
