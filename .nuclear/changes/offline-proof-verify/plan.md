# Plan: offline proof verification for auditors

1. Confirm what auditors can already reach: `GET /records/verify`, `GET /packages/:id/proof`, the Records page download.
2. Add `verify-bundle.ts`: read a file, accept the bundle or the whole proof response, call `verifyInclusion`, print a plain result and its limits, exit 0, 1 or 2.
3. Wire `pnpm cr verify <file>`, building the control plane first when its sources changed.
4. Test: unsealed pass, whole-response form, edited, missing and cut entries, non-bundle files; and the real sealed bundle in `seals.test.ts`.
5. Add the hint on the Records page; write `docs/auditing.md`; update the crosswalk, status and index.
6. Owner reviews. Done when recorded in `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An auditor holding a downloaded inclusion proof can run `pnpm cr verify <file>` with no database or sign-in and get a pass or a named failure from the control plane's own `verifyInclusion`, with what it cannot settle stated; `docs/auditing.md` explains sampling and limits; tests cover pass, tamper, cut tail, sealed bundle and non-bundle files; CI is green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
