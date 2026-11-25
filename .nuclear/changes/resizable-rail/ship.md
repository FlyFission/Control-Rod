# Ship: Make the sidebar resizable and collapsible

Release decision: **merge** when CI is green. The owner chose "Merge it when CI is green" in the project thread on 2026-11-25 at 00:46 UTC, after six Codex blind-review rounds whose findings are all fixed (verification E-04 to E-09). Codex's last verdict was NO-MERGE on edge cases that are now fixed. No trust surface is touched.

## Signature

Owner (sole maintainer): yes to merge when CI is green, recorded in the project thread on 2026-11-25.

- Rollback: revert the merge. Saved widths are per-browser conveniences under `cr.rail:<user>` and are ignored after a revert.
- Monitoring after merge: on a real install, the rail opens at the saved width and nothing in the workspace is hard to click near its edge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
