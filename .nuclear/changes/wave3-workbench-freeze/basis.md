# Basis: Wave 3/4 workbench views (Explore, Compare, Today), hardened /repos/freeze, and semantic invariants

**Change slug:** `wave3-workbench-freeze`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer (`@FlyFission`)
**Date:** 2026-11-21
**Decision this basis supports:** whether branch `feat/wave3-workbench-freeze` is merged onto `main` to restore the Wave 3/4 workbench UI (`Explore`, `Compare`, `Today`), hardened `POST /repos/freeze` (`freezeWorkspace`), and `verifySemanticInvariants` without regressing `main`'s security hardenings or trust surfaces.

## Mission / need

Commits `df79588d` (`feat/wave3-workbench-outfall`) and `67924caf` (`feat/wave4-full-integration`) introduced the `Explore` (with repo path/label, Checkpoint, and Merkle Freeze controls), `Compare`, and `Today` workbench views alongside `freezeWorkspace`, `POST /repos/freeze`, and `verifySemanticInvariants`. Subsequent work on `main` hardened `services/api/src/repos.ts` (`asBodyRecord`, `withGitRefusal`, `resolveSafeWorkspaceRoot`, symlink-safe containment, filter/CRLF neutralization in `createCheckpoint`, and `hostGitEnv(workspaceRoot)`) and formalized `spec/api.tsp` for `/events/verify` and `/repos/checkpoint`. This change ports the Wave 3/4 workbench pages, `POST /repos/freeze`, and `verifySemanticInvariants` cleanly onto `main` while preserving all of `main`'s hardening and keeping all trust surfaces untouched.

## Scope

In scope:
- Web UI: `apps/web/src/pages/Compare.tsx`, `apps/web/src/pages/Today.tsx`, `apps/web/src/pages/Explore.tsx` (Wave 4 version wired to `api.checkpointRepo` and `api.freezeRepo`), `apps/web/src/pages/wave3-pages.test.tsx`, `apps/web/src/router.tsx` (`/compare`, `/today`), `apps/web/src/places/places.ts` (`/today`, `/compare` in `PLACES`), and `apps/web/src/api/{types.ts,client.ts}` (adding `FreezeRequest`, `FreezeResult`, and `freezeRepo` while keeping `checkpointRepo` and `recordsExport` intact).
- API: `services/api/src/outfall.ts` (`freezeWorkspace` accepting and passing `workspaceRoot` into `createCheckpoint` and `hostGitEnv(ceilingDir)`, plus pure outfall helpers `recordVerdict`, `issueClearance`, `recordApplication`, without registering `outfallRoutes`), `services/api/src/repos.ts` (hardened `POST /repos/freeze` using `asBodyRecord`, `resolveSafeWorkspaceRoot`, `withGitRefusal`, and shared `parseRepoSnapshotRequest`), `services/api/src/refusals.ts` (registering `invalid-verdict`, `invalid-clearance`, `invalid-application`, `verdict-not-accepted` required by `refusals.test.ts`), `services/api/src/events.ts` (`SemanticViolation` and `verifySemanticInvariants` exported while preserving `verifyChain()`'s existing `spec/api.tsp`-compatible return shape), and `services/api/test/wave3-outfall.test.ts`.
- Change record: `.nuclear/changes/wave3-workbench-freeze/`.

Out of scope:
- Any edits to `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, or `docs/adr/`.
- Registering `/outfall/*` HTTP routes (`outfallRoutes`) or modifying `/events/verify` / `seals.ts` response schemas.

## Fixed inputs

- Reference commits `df79588d` (`feat/wave3-workbench-outfall`) and `67924caf` (`feat/wave4-full-integration`).
- `main`'s hardened `services/api/src/repos.ts` (`resolveSafeWorkspaceRoot`, `resolveWithoutSymlinks`, `withGitRefusal`, `createCheckpoint`, `hostGitEnv`) and `services/api/test/refusals.test.ts` (every `new Refusal(...)` code must exist in `REASONS` in `services/api/src/refusals.ts`).
- `spec/api.tsp` contract for `GET /events/verify` (`{ ok, count, broken_at? }`) and existing `POST /repos/checkpoint` and `GET /records/export` clients.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `createCheckpoint` and `freezeWorkspace` operate inside a validated `workspaceRoot` when invoked via HTTP (`POST /repos/freeze`). | `parseRepoSnapshotRequest` calls `resolveSafeWorkspaceRoot` and `createCheckpoint` enforces `isContainedIn` + `resolveWithoutSymlinks`. | An HTTP request to `/repos/freeze` operating outside `workspaceRoot` or traversing symlinks. |
| Keeping `verifyChain()`'s return shape `{ ok, count, broken_at? }` preserves compatibility with `spec/api.tsp`, `/events/verify`, and `seals.ts`. | `spec/generated/openapi/openapi.json` and `services/api/test/{app,seals}.test.ts`. | A caller requiring `semantic_violations` on `GET /events/verify` before `spec/api.tsp` is updated. |
| Wave 3/4 `Compare` and `Today` views use existing `api.packages()` responses without new backend routes. | `apps/web/src/pages/{Compare,Today}.tsx` and `wave3-pages.test.tsx`. | A requirement for persistent server-side compare notes or outfall route wiring in this change. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Related prior change: [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md).

## Exit criteria

Web typecheck/tests and API typecheck/targeted tests pass after the final edit, `ng.py validate --strict-custody` passes on `.nuclear/changes/wave3-workbench-freeze/`, no trust surface is modified, and the branch holds for owner review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
