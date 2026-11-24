# Trace: Wave 3/4 workbench views (Explore, Compare, Today), hardened /repos/freeze, and semantic invariants

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | `Explore`, `Compare`, and `Today` pages render, switch modes, trigger `/repos/checkpoint` and `/repos/freeze`, anchor digest notes, and group packages cleanly. | `apps/web/src/pages/wave3-pages.test.tsx` (3 tests); full `@control-rod/web` suite (50 files, 676 tests) | implemented and tested (`E-01`) |
| T-02 | `/today` and `/compare` are registered in `router.tsx` and `PLACES` in `places.ts`, and `api.checkpointRepo` / `api.recordsExport` remain intact alongside `api.freezeRepo`. | `apps/web/src/places/places.test.tsx`, `apps/web/src/pages/records.test.tsx`, `apps/web/src/pages/wave3-pages.test.tsx` | implemented and tested (`E-01`) |
| T-03 | `freezeWorkspace` computes a deterministic Merkle tree digest without deleting untracked files, and propagates `workspaceRoot` into `createCheckpoint` and `hostGitEnv(ceilingDir)`. | `services/api/test/wave3-outfall.test.ts` ("freezeWorkspace captures deterministic Merkle digest...") | implemented and tested (`E-02`) |
| T-04 | `POST /repos/freeze` enforces `workspaceRoot` containment, runtime input type checks, and `withGitRefusal` (`git-failed` mapping) without regressing `/repos/checkpoint` or `/repos/remove`. | `services/api/test/wave3-outfall.test.ts` ("POST /repos/freeze enforces workspaceRoot containment..."), `services/api/test/repos.test.ts` (24 tests) | implemented and tested (`E-02`) |
| T-05 | `verifySemanticInvariants` detects non-monotonic `seq`, timestamp regression, and missing or empty decision `status`, while `verifyChain()` preserves `spec/api.tsp` compatibility. | `services/api/test/wave3-outfall.test.ts`, `services/api/test/app.test.ts` (16 tests), `services/api/test/seals.test.ts` (16 tests), `services/api/test/verify-bundle.test.ts` (5 tests) | implemented and tested (`E-02`) |
| T-06 | Pure outfall helpers enforce Verdict -> Clearance -> Application without registering `/outfall/*` routes or leaving unregistered `Refusal` codes. | `services/api/test/wave3-outfall.test.ts`, `services/api/test/refusals.test.ts` (6 tests) | implemented and tested (`E-02`) |
| T-07 | Change record satisfies strict custody validation and touches zero trust surfaces. | `ng.py validate --strict-custody .nuclear/changes/wave3-workbench-freeze/` | implemented and tested (`E-03`) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Related prior change: [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md).

## Exit criteria

Web typecheck/tests and API typecheck/targeted tests pass after the final edit, `ng.py validate --strict-custody` passes on `.nuclear/changes/wave3-workbench-freeze/`, no trust surface is modified, and the branch holds for owner review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
