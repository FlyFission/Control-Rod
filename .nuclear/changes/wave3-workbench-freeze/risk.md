# Risk: Wave 3/4 workbench views (Explore, Compare, Today), hardened /repos/freeze, and semantic invariants

- **Mode:** Standard
- Execution owner: subagent porting Wave 3/4 features onto `main` in isolated worktree `control-rod-wave3-workbench` (`feat/wave3-workbench-freeze`).
- Decision owner: Ben Huffer (`@FlyFission`). No trust surface is modified (`policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, `docs/adr/` are untouched).
- Scope: `apps/web/src/pages/{Explore,Compare,Today}.tsx`, `apps/web/src/pages/wave3-pages.test.tsx`, `apps/web/src/router.tsx`, `apps/web/src/places/places.ts`, `apps/web/src/api/{client,types}.ts`, `services/api/src/{events,outfall,refusals,repos}.ts`, `services/api/test/wave3-outfall.test.ts`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | `POST /repos/freeze` or `freezeWorkspace` bypasses `workspaceRoot` containment, symlink checks, or host Git isolation. | `POST /repos/freeze` uses `parseRepoSnapshotRequest` (`asBodyRecord`, `resolveSafeWorkspaceRoot`, string checks) and `withGitRefusal`, passing `workspaceRoot` into `createCheckpoint` and `freezeWorkspace`, which resolves `cwd` with `resolveWithoutSymlinks` and calls `git ls-tree` with `HOST_GIT_ARGS` and `hostGitEnv(ceilingDir)`. | Any `/repos/freeze` call succeeding for a path outside `workspaceRoot`, traversing symlinks, or passing an uncontained `GIT_CEILING_DIRECTORIES`. |
| R-02 | Changing `events.ts` breaks `GET /events/verify`, `spec/api.tsp` compatibility, or `seals.ts` verification. | `verifySemanticInvariants` and `SemanticViolation` are exported separately; `verifyChain()` keeps its exact `{ ok, count, broken_at? }` return shape. | Any failure in `app.test.ts`, `seals.test.ts`, or `verify-bundle.test.ts`. |
| R-03 | Adding `outfall.ts` introduces unregistered `Refusal` codes or exposes unauthenticated `/outfall/*` routes. | `outfallRoutes` is omitted; all 4 `Refusal` codes thrown by pure outfall helpers are registered in `services/api/src/refusals.ts`. | `refusals.test.ts` fails on unregistered codes, or any `/outfall/*` route is registered. |
| R-04 | Porting `Explore`, `Compare`, `Today`, or `api/client.ts` drops `main`'s `checkpointRepo` / `recordsExport` or breaks shell navigation tests. | `checkpointRepo` and `recordsExport` remain untouched in `client.ts`; `places.ts` and `router.tsx` add `/today` and `/compare` cleanly; verified by full `@control-rod/web` test suite. | Any regression in `places.test.tsx`, `records.test.tsx`, or `wave3-pages.test.tsx`. |

## Selected mode

- **Mode:** Standard
- Basis: restores workbench pages and adds an authenticated `/repos/freeze` endpoint on top of `main`'s hardened git/worktree layer; no trust surfaces or `spec/` files modified.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Related prior change: [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md).

## Exit criteria

Web typecheck/tests and API typecheck/targeted tests pass after the final edit, `ng.py validate --strict-custody` passes on `.nuclear/changes/wave3-workbench-freeze/`, no trust surface is modified, and the branch holds for owner review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
