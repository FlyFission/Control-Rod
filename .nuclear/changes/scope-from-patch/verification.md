# Verification: Scope drift and Plant bays use the files a patch changes

- E-01: `tsc -p services/api/tsconfig.json --noEmit` passes.
- E-02: `tools/test-api.mjs` with PostgreSQL 16 (cloud container): change-files, figures, figures-race, scoped-send-back, patch-files: 28 tests pass (7 new, 1 extended).
- E-03: runs, work-lanes, publish-checkout: 89 tests pass.
- Not covered: an end-to-end checkout card through two rounds with a real daemon; drift for that path is covered by unit tests of changedRepoFiles only.
- Blind check: the repository's automatic Codex review on the PR.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
