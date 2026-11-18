# Basis: Wave 1 hardened worktrees, checkpoints, and host Git isolation

**Change slug:** `wave1-hardened-worktrees`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer (`@FlyFission`)
**Date:** 2026-11-18
**Decision this basis supports:** whether PR `#83` (`feat/wave1-hardened-worktrees`) is ready for owner `/spec/` CODEOWNERS review and squash-merge to `main` under Cycle 1 PR hardening.

## Mission / need

PR `#83` adds Wave 1 worktree lifecycle controls on top of `#82`'s workspace materialization: daemon host-Git environment/argument hardening (`daemon/internal/runner/git_host.go`), Capital Projects directory scaffolding (`mode: "capital-projects"`), temporary-index Git checkpoints (`POST /repos/checkpoint`), and guarded worktree removal (`POST /repos/remove`). Independent multi-CLI and automated reviews identified secret-copy/TOCTOU risk in `copyIgnoredArtifacts()` (`preserve_patterns`), LFS `required=true` filter exit-128 failures, missing force-staged index preservation, unborn `HEAD` failure, checkpoint ref collision risk, uncontained `repo_path` and `~user` tilde gaps in `isDangerousWorktreeRemovalPath()`, stale registered missing worktrees on `/repos/remove`, `"false"` boolean coercion, TypeSpec contract drift, and missing `mode` wiring in `NewWorkModal.tsx`. This packet records the Cycle 1 `#83` restack, hardenings, and post-edit verification evidence.

## Scope

In scope:
- `daemon/internal/runner/git_host.go` and `daemon/internal/runner/git_host_test.go` (`HostGitArgs`, `HostGitNetworkArgs`, `HostGitEnv`, `HostGitCommand`, and 4 `TestHostGit*` tests).
- `docs/third-party/register.md` and `third_party/licenses/GoogleCloudPlatform__scion/{INVENTORY.txt,LICENSE}` (Apache-2.0 attribution for `pkg/util/git_host.go` at commit `8845a940763f91519d25e72cde3762d6e31df4cb`).
- `spec/api.tsp`, `spec/generated/openapi/openapi.json`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/{types.ts,client.ts}` (additive `mode`, `scaffolded_dirs`, `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, `POST /repos/checkpoint`, `POST /repos/remove`; `preserve_patterns` omitted).
- `services/api/src/repos.ts`, `services/api/src/refusals.ts`, and `services/api/test/repos.test.ts` (removal of `copyIgnoredArtifacts`, `filterDisableEnv` transient `GIT_CONFIG_*` filter/CRLF neutralization, `createCheckpoint` `.git` + index + unborn `HEAD` + UUID/CAS hardening, `isDangerousWorktreeRemovalPath` + `removeWorktreeSafely` + `withGitRefusal` hardening, `scaffoldCapitalProjectDirs`, and 5 refusal codes: `invalid-repo-path`, `invalid-worktree-path`, `unsafe-worktree-path`, `worktree-dirty`, `worktree-not-found`).
- `apps/web/src/components/{NewWorkModal.tsx,newwork.test.tsx}` (wiring `mode` through `PrepareSnapshot` and `api.materializeRepo`).
- `.nuclear/changes/wave1-hardened-worktrees/` (this Standard change record).

Out of scope (explicitly deferred to Cycle 2 or other PRs):
- Retaining `preserve_patterns` or `copyIgnoredArtifacts()` (removed in Cycle 1 per YAGNI).
- Wiring worktree paths or runtime selections directly into daemon execution (`daemon/internal/runner/workspace.go`, Cycle 2).
- Wave 2–4 endpoints and UI (`#84–#86`, including `/repos/freeze`, `checkpointRepo`/`freezeRepo` board UI callers, multi-CLI adapters, and `/outfall/*`).
- Qualifying `codex-cli 0.169.0` features beyond `0.167.0` (`sandbox.go:368`).
- Any edits to `policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/`, or `docs/adr/`.

## Fixed inputs

- Cycle 1 design specification (`docs/superpowers/specs/2026-11-16-cycle1-pr-hardening-design.md`) and implementation plan (`docs/superpowers/plans/2026-11-17-cycle1-pr-hardening.md`), approved by owner Ben Huffer (`@FlyFission`), including owner approval for the additive `/repos` updates (`mode`, `scaffolded_dirs`, `/checkpoint`, `/remove`) in `spec/api.tsp`.
- `.github/CODEOWNERS`: `/spec/` requires review by a maintainer who did not author the change (`@FlyFission` sign-off on PR `#83`).
- `AGENTS.md` Rules 1–6 and `docs/collaboration.md` (squash-merge, DCO `Signed-off-by:`, honest AI-authorship disclosure, no skipped or relaxed tests).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| No Cycle 1 caller requires `preserve_patterns` / `copyIgnoredArtifacts()`. | Grep of `main` and `#83` confirms zero first-party callers; Cycle 1 spec Section 1 and Section 5.1 remove it per YAGNI. | A Cycle 1 workflow requiring automatic copying of `.gitignore`d files into new worktrees. |
| Checkpoints on Git LFS repositories are intended to record raw working-tree or pointer bytes without invoking external filter binaries. | `filterDisableEnv()` and `createCheckpoint()` JSDoc in `services/api/src/repos.ts:383-422,872-877`. | A requirement for `/repos/checkpoint` to invoke external `git-lfs` clean/smudge filters. |
| Host `git` supports `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` and `rev-parse --path-format=absolute --git-path index`. | Verified against host Git in `services/api/test/repos.test.ts`. | An older target Git version lacking `--path-format=absolute` or `GIT_CONFIG_COUNT` (Git < 2.31). |
| `spec/api.tsp` remains the single source of truth for API contracts. | `pnpm spec`, `pnpm --filter @control-rod/web gen:api`, and `git diff --exit-code` (`evidence/spec-drift.log`). | Any manual edit to `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, or `apps/web/src/api/schema.d.ts`. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All Cycle 1 `#83` deliverables pass TypeSpec drift, API typecheck/Vitest, Web typecheck/Vitest/build, `daemon` `gofmt`/`go vet`/`TestHostGit*`/`confinement`/`digest`, Python governance/inventory/originality/public-claims/redteam checks, and `ng.py validate --strict-custody`; local `codex-cli 0.169.0` and pre-existing `check_register.py` findings are recorded accurately without skipping tests; and PR `#83` holds for owner `/spec/` CODEOWNERS review and merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
