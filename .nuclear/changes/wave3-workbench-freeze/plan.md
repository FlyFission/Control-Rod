# Plan: Wave 3/4 workbench views (Explore, Compare, Today), hardened /repos/freeze, and semantic invariants

1. **Web API client & types (`apps/web/src/api/{types.ts,client.ts}`):** keep `main`'s `checkpointRepo`, `recordsExport`, and existing types intact; add `FreezeRequest`, `FreezeResult`, and `api.freezeRepo`.
2. **Web pages, places, and router (`apps/web/src/pages/{Explore,Compare,Today}.tsx`, `wave3-pages.test.tsx`, `places/places.ts`, `router.tsx`):** port `Compare.tsx` and `Today.tsx` from `df79588d`/`67924caf`, port Wave 4 `Explore.tsx` from `67924caf` with repo path/label and Capture Checkpoint / Merkle Freeze buttons, port `wave3-pages.test.tsx` (covering both `/repos/checkpoint` and `/repos/freeze`), register `/compare` and `/today` in `router.tsx`, and add them to `PLACES` in `places.ts`.
3. **API semantic invariants (`services/api/src/events.ts`):** export `SemanticViolation` and `verifySemanticInvariants` while keeping `verifyChain()`'s existing `{ ok, count, broken_at? }` return shape intact for `spec/api.tsp`, `/events/verify`, and `seals.ts`.
4. **API Merkle freeze & pure outfall helpers (`services/api/src/outfall.ts`, `services/api/src/refusals.ts`, `services/api/src/repos.ts`, `services/api/test/wave3-outfall.test.ts`):**
   - Port `freezeWorkspace` and pure helpers (`recordVerdict`, `issueClearance`, `recordApplication`) into `outfall.ts` without registering `outfallRoutes`; update `freezeWorkspace` to accept `workspaceRoot`, pass it into `createCheckpoint`, resolve `resolvedRepoDir` safely without traversing symlinks, and pass `resolveSafeWorkspaceRoot(opts.workspaceRoot)` (or `defaultWorkspaceRoot()`) to `hostGitEnv`.
   - Register the 4 pure outfall `Refusal` codes (`invalid-verdict`, `invalid-clearance`, `invalid-application`, `verdict-not-accepted`) in `services/api/src/refusals.ts` so `refusals.test.ts` continues to pass.
   - Add `POST /repos/freeze` in `services/api/src/repos.ts` sharing `parseRepoSnapshotRequest` (`asBodyRecord`, `resolveSafeWorkspaceRoot`, string validation on `repo_path` and `label`) and `withGitRefusal` with `POST /repos/checkpoint`.
   - Port `services/api/test/wave3-outfall.test.ts` and add HTTP tests for `POST /repos/freeze` (`workspace_root` containment, type validation, and `git-failed` mapping).
5. **Verification & change record:** run web typecheck/tests, API typecheck and targeted Vitest suites (`wave3-outfall`, `repos`, `repos-materialize`, `refusals`, `seals`, `app`, `verify-bundle`, `workbench`), retain logs in `evidence/`, validate with `ng.py validate --strict-custody`, and commit on `feat/wave3-workbench-freeze`.

## Interfaces as built

- Web client: `FreezeRequest`, `FreezeResult`, `api.freezeRepo(body: FreezeRequest): Promise<FreezeResult>`.
- API events: `SemanticViolation`, `verifySemanticInvariants(events: readonly EventRecord[]): SemanticViolation[]`.
- API outfall: `FreezeResult`, `OutfallVerdict`, `OutfallClearance`, `ControlledRecord`, `freezeWorkspace(opts: { repoDir: string; label?: string; workspaceRoot?: string }): Promise<FreezeResult>`, `recordVerdict`, `issueClearance`, `recordApplication`.
- API route: `POST /repos/freeze` (`{ repo_path, label?, workspace_root? }` -> `{ ok: true, ...FreezeResult }`).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Related prior change: [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md).

## Exit criteria

Web typecheck/tests and API typecheck/targeted tests pass after the final edit, `ng.py validate --strict-custody` passes on `.nuclear/changes/wave3-workbench-freeze/`, no trust surface is modified, and the branch holds for owner review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
