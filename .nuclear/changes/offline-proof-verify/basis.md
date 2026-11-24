# Basis: offline proof verification for auditors

**Change slug:** `offline-proof-verify`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether `pnpm cr verify` and `docs/auditing.md` are accepted as the first implementation step toward an auditable system.

## Mission / need

On 2026-11-21, after reading the QA standards crosswalk (`qa-standards-crosswalk`), the owner wrote: "Yeah thats a good approach. Light and not overcommitting. Work towards implementation. Our system should be "auditable"." The crosswalk lists audits (Appendix B Criterion XVIII) as the one row with nothing behind it. The Records page already downloads an inclusion proof that "anyone holding the bundle can recompute" (`services/api/src/seals.ts`), but the repository ships no way to check one outside the running app.

## Scope

In scope: `services/api/src/verify-bundle.ts` (CLI around the existing `verifyInclusion`), `pnpm cr verify` in `scripts/cr.mjs`, one hint line on the Records page, tests, `docs/auditing.md`, and row updates in `docs/qa-standards.md`, `docs/status.md` and `docs/README.md`. Out of scope: any change to `verifyInclusion`, the chain, seals, kernel, `spec/`, policies or workflows. A time-window export needs a new contract in `spec/` (a trust surface) and is left for the owner's decision.

## Fixed inputs

`verifyInclusion` and `InclusionBundle` in `services/api/src/seals.ts` as on `main`; the bundle the Records page downloads (`p.bundle`); AGENTS.md rules 1 to 6.

## Sources

1. `services/api/src/seals.ts`, `services/api/test/seals.test.ts`, `apps/web/src/pages/Records.tsx` on `main` at `47f86af`.
2. `docs/qa-standards.md` gap list (this branch).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `verifyInclusion` needs nothing but the bundle. | Its doc comment and the existing tests, which check edited bundles with no database. | A change to it reads the database or a server. |
| An auditor can run Node 22 and pnpm. | The repository's stated requirements. | An auditor needs a single binary; then build one. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An auditor holding a downloaded inclusion proof can run `pnpm cr verify <file>` with no database or sign-in and get a pass or a named failure from the control plane's own `verifyInclusion`, with what it cannot settle stated; `docs/auditing.md` explains sampling and limits; tests cover pass, tamper, cut tail, sealed bundle and non-bundle files; CI is green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
