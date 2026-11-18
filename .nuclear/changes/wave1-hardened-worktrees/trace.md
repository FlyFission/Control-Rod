# Trace: Wave 1 hardened worktrees, checkpoints, and host Git isolation

| ID | Requirement | Tests / checks | Disposition |
|---|---|---|---|
| T-01 | `daemon/internal/runner/git_host.go` implements `HostGitArgs`, `HostGitNetworkArgs`, `HostGitEnv`, and `HostGitCommand`, with Apache-2.0 attribution recorded in `docs/third-party/register.md` and `third_party/licenses/GoogleCloudPlatform__scion/`. | `gofmt -l .`, `go vet ./...`, `go test -v -run TestHostGit ./internal/runner` (4 tests), `go test ./internal/confinement ./internal/digest`, `go test ./...` | implemented; `TestHostGit*`, `confinement`, `digest`, `gofmt`, `go vet` pass; `TestInstalledCodexLeavesOnlyQualifiedFeatures` fails locally on `codex-cli 0.169.0` (`evidence/daemon-checks.log`) |
| T-02 | `copyIgnoredArtifacts()` and `preserve_patterns` are removed from `services/api/src/repos.ts`, `spec/api.tsp`, and `services/api/test/repos.test.ts` per Cycle 1 YAGNI. | Code inspection, TypeSpec compile, `services/api/test/repos.test.ts` | implemented and verified (`evidence/spec-drift.log`, `evidence/api-checks.log`) |
| T-03 | `spec/api.tsp` defines `mode`, `scaffolded_dirs`, `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, `POST /repos/checkpoint`, and `POST /repos/remove`; `spec/generated/`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/{types.ts,client.ts}` stay in sync; `NewWorkModal.tsx` passes `mode`. | `pnpm spec`, `pnpm --filter @control-rod/web gen:api`, `git diff --exit-code`, `pnpm --filter @control-rod/web typecheck`, `newwork.test.tsx` | implemented and verified (`evidence/spec-drift.log`, `evidence/web-checks.log`) |
| T-04 | `filterDisableEnv()` neutralizes `filter.<driver>.{clean,smudge,process,required}` (including LFS `required=true` and `=` in driver names) and CRLF config transiently via `GIT_CONFIG_*` across checkpoint, status, checkout, and worktree add. | `services/api/test/repos.test.ts` | implemented and verified (`evidence/api-checks.log`) |
| T-05 | `createCheckpoint()` enforces `.git` + workspace containment, preserves force-staged index entries via `--path-format=absolute --git-path index`, handles unborn `HEAD`, and writes `randomUUID()` refs with CAS `update-ref`. | `services/api/test/repos.test.ts` | implemented and verified (`evidence/api-checks.log`) |
| T-06 | `isDangerousWorktreeRemovalPath()` and `removeWorktreeSafely()` contain `repoPath` and `worktreePath`, reject `~user` and symlinks, enforce `force === true`, prune/remove missing-on-disk registered worktrees, map git errors to `400 git-failed`, and teach all 5 new refusal codes in `services/api/src/refusals.ts`. | `services/api/test/repos.test.ts`, `services/api/test/refusals.test.ts` | implemented and verified (`evidence/api-checks.log`) |
| T-07 | Repository governance, command inventory, public claims, originality, red-team catalog, node license gate, and change-record custody checks pass across all packets. | `tools/generate_command_inventory.py --check`, `tools/check_public_claims.py`, `tools/check_originality.py`, `tools/check_redteam.py`, `tools/check_register.py`, `ng.py validate --strict-custody`, `node tools/license-gate.mjs`, `sdk/python` checks | implemented and verified (`evidence/tools-checks.log`, `evidence/ng-validate.log`, `evidence/ci-aux-checks.log`); `check_register.py` reports only 2 pre-existing findings in `kind.ts` and `seals.ts` |
| T-08 | Independent CODEOWNERS review of `/spec/` and PR `#83` merge decision by owner (`@FlyFission`). | Owner PR review | open; held for owner |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All requirements `T-01`..`T-07` have post-edit evidence logs and exact status disclosures; `T-08` holds for independent owner `/spec/` CODEOWNERS review and merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
