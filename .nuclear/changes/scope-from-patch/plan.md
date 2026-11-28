# Plan: Scope drift and Plant bays use the files a patch changes

1. Move the patch helpers to `change-files.ts` and add the three functions with unit tests (`test/change-files.test.ts`).
2. Use them in scopeDrift and in the figure projection; extend `test/figures.test.ts` with a checkout card (patch plus RESPONSE.md) that must land in Backend, not Docs.
3. Typecheck and the related API suites; draft PR; Codex review; merge on green under the owner's merge-on-green permission (to 2026-12-02).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
