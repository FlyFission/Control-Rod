# Plan: Wave 1 hardened worktrees, checkpoints, and host Git isolation

1. Restack `feat/wave1-hardened-worktrees` (`#83`) cleanly onto updated `origin/main` (post-`#82`), preserving `#82`'s `repos.ts` containment/symlink/identity hardenings and `NewWorkModal.tsx` fixes alongside Wave 1's `daemon/internal/runner/git_host.go`, `git_host_test.go`, `docs/third-party/register.md`, `third_party/licenses/GoogleCloudPlatform__scion/`, and `services/api/src/refusals.ts` additions.
2. Remove `copyIgnoredArtifacts()` and `preserve_patterns` from `services/api/src/repos.ts`, `spec/api.tsp`, and `services/api/test/repos.test.ts` per Cycle 1 YAGNI.
3. Extend `spec/api.tsp` under `@route("/repos")` with `mode` and `scaffolded_dirs` on `MaterializeRepoRequest`/`MaterializeRepoResult`, plus `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, `POST /repos/checkpoint`, and `POST /repos/remove`. Regenerate `spec/generated/`, `services/api/src/preparation/schema.d.ts`, and `apps/web/src/api/schema.d.ts`; export generated types in `apps/web/src/api/{types.ts,client.ts}` and pass `mode` from `apps/web/src/components/NewWorkModal.tsx` (`PrepareSnapshot` and `api.materializeRepo`).
4. Harden `services/api/src/repos.ts`:
   - Add `filterDisableEnv()` using `GIT_CONFIG_COUNT`/`KEY_i`/`VALUE_i` to neutralize `filter.<driver>.clean`, `.smudge`, `.process`, `.required=false`, and CRLF conversions across `createCheckpoint()`, `scanLocalRepos()`, `removeWorktreeSafely()`, `checkoutOrCreateBranch()`, and `materializeFreshClone()`.
   - In `createCheckpoint()`, enforce `isContainedIn(workspaceRoot, expandedRepo)` and `resolveRepoGitDirs()`, resolve the real index via `git rev-parse --path-format=absolute --git-path index` (copying to `tempIndex` if present, skipping `read-tree HEAD` on unborn `HEAD`), and write `refs/cr-checkpoints/<slug>-<stamp>-<randomUUID()>` with CAS `git update-ref <ref> <commitSha> ""`.
   - In `isDangerousWorktreeRemovalPath()` and `removeWorktreeSafely()`, enforce `repoPath` and `worktreePath` containment inside `workspaceRoot`, reject `~user` tilde paths via `expandHomePath()`, require `body.force === true`, prune/remove missing-on-disk registered worktrees cleanly, and map route git errors to `400 git-failed` via `withGitRefusal()`.
5. Update `services/api/test/repos.test.ts` (using temp `HOME` instead of `~/.cr-repos-test-*`) and `apps/web/src/components/newwork.test.tsx` to cover LFS `required=true`, custom filter drivers with `=`, force-staged index preservation, unborn `HEAD`, non-repo subdir refusal, concurrent CAS checkpoints, uncontained `repo_path`, `~user` paths, `"false"` `force` rejection, missing-dir worktree pruning, `git-failed` mapping, and `mode: "capital-projects"` scaffolding.
6. Author this Standard change record `.nuclear/changes/wave1-hardened-worktrees/`, run the full verification gate after all code edits, capture raw logs in `evidence/`, and hold PR `#83` for owner `/spec/` CODEOWNERS review and merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every step above is backed by committed code and post-edit evidence logs in `evidence/`, all change records validate under `ng.py validate --strict-custody`, any local environment or version-skew findings are disclosed transparently without skipping tests, and the owner retains the `/spec/` CODEOWNERS review and merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
