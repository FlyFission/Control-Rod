# Trace: Scope drift and Plant bays use the files a patch changes

| Need | Code | Test |
| --- | --- | --- |
| Files a checkout card touches come from its patch | `change-files.ts` touchedFiles | `change-files.test.ts` "uses the files the change patch touches..." |
| No patch: output names as before | same | "falls back to output names when there is no patch" |
| Per-file split of git and plain diffs | patchSections | "splits a git patch and a plain unified diff per file" |
| Drift names real files, never changes.patch or RESPONSE.md | changedRepoFiles, work.ts scopeDrift | "on a checkout card, names the repository files...", "reports a file a later round stopped changing" |
| Plant bay by patched files, not the Docs bay | figures.ts | `figures.test.ts` "places work by the project's work lanes..." (WP-LANE-PATCH) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
