# Verification: Wave 1 hardened worktrees, checkpoints, and host Git isolation

Evidence status: **pass** for TypeSpec contract sync (`E-01`), API typecheck and full Vitest suite (`E-02`), Web typecheck/Vitest/build (`E-03`), Python inventory/claims/originality/redteam/strict-custody validation (`E-05`), and local Node license gate plus `sdk/python` checks (`E-06`). **Partial / local failure** for `daemon` (`E-04`: `gofmt`, `go vet`, `internal/confinement`, `internal/digest`, and all 4 `TestHostGit*` tests in `internal/runner` pass, while `TestInstalledCodexLeavesOnlyQualifiedFeatures` in `internal/runner` fails locally against installed `codex-cli 0.169.0` due to 7 newer unqualified features beyond `0.167.0`, unrelated to `#83`). **Pre-existing non-zero** in `tools/check_register.py` (`E-05`: 2 pre-existing findings in `kind.ts` and `seals.ts`; `git_host.go` passes with 0 new regressions). **Open** for independent owner `/spec/` CODEOWNERS review and PR `#83` merge decision (`E-07`).

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | `pnpm spec` (TypeSpec 1.18.0, 53 runner schemas, `openapi-typescript 7.13.0`), `pnpm --filter @control-rod/web gen:api`, and `git diff --exit-code -- spec/generated services/api/src/preparation/schema.d.ts` exit 0 with zero drift. | `evidence/spec-drift.log` |
| E-02 | pass | `pnpm --filter @control-rod/api typecheck` exits 0; `pnpm --filter @control-rod/api test` (Vitest 5.1.0 against local PostgreSQL test fixture) passes all 59 test files / 728 tests (including 21 tests in `test/repos.test.ts`, 26 tests in `test/repos-materialize.test.ts`, and 6 tests in `test/refusals.test.ts`), exit 0. | `evidence/api-checks.log` |
| E-03 | pass | `pnpm --filter @control-rod/web typecheck` exits 0; `pnpm --filter @control-rod/web test` (Vitest 5.1.0) passes all 45 test files / 624 tests (including 16 tests in `src/components/newwork.test.tsx`), exit 0; `pnpm --filter @control-rod/web build` exits 0 (40 office contract tests, 462 modules transformed). | `evidence/web-checks.log` |
| E-04 | fail | From `daemon/` (Go `go1.24.7`): `gofmt -l .` prints nothing; `go vet ./...` exits 0; `go test ./internal/confinement ./internal/digest` exits 0; `go test -v -run TestHostGit ./internal/runner` passes all 4 `TestHostGit*` tests (`TestHostGitArgsNeutralizesHostExecution`, `TestHostGitNetworkArgsRestrictsProtocols`, `TestHostGitEnvStripsDangerousGitVars`, `TestHostGitCommandSetsArgsAndEnv`), exit 0; `go test ./...` exits 1 only on `TestInstalledCodexLeavesOnlyQualifiedFeatures` (`internal/runner/sandbox_test.go:304`) because local `codex-cli 0.169.0` leaves 7 newer unqualified features on (`code_mode_host_grpc`, `code_mode_host_output_truncation`, `guardian_include_additional_context`, `incremental_tools_legacy_gcp`, `retain_client_tool_outputs`, `unified_image_budget`, `untrusted_as_tool_output`) beyond `0.167.0`. | `evidence/daemon-checks.log` |
| E-05 | pass | `tools/generate_command_inventory.py --check` exits 0; `tools/check_public_claims.py` exits 0; `tools/check_originality.py` exits 0; `uv run --with pyyaml python3 tools/check_redteam.py` exits 0 (25 red-team cases: 2 active, 23 pending); `ng.py validate --strict-custody` passes across all 23 packets under `.nuclear/changes/`. `tools/check_register.py` exits 1 only on 2 pre-existing findings (`apps/web/src/lib/kind.ts`, `services/api/src/seals.ts`) with 0 regressions from `daemon/internal/runner/git_host.go`. | `evidence/tools-checks.log`, `evidence/ng-validate.log` |
| E-06 | pass | `node tools/license-gate.mjs` passes for 212 production Node packages (exit 0); `sdk/python` `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest -q` (33 passed) exit 0. Local shell lacks `cargo-deny` and `go-licenses` binaries (deferred to GitHub CI `licenses` job, alongside `rust` and `sbom` jobs). | `evidence/ci-aux-checks.log` |
| E-07 | open | Independent owner (`@FlyFission`) `/spec/` CODEOWNERS review and PR `#83` merge decision. | Not executed |

## What was not qualified

- `preserve_patterns` / `copyIgnoredArtifacts()` (removed in Cycle 1 per YAGNI).
- Direct binding of `NewWorkModal` worktree paths or runtime selections into `daemon/internal/runner/workspace.go` (deferred to Cycle 2).
- `codex-cli 0.169.0` features beyond `0.167.0` (`sandbox.go:368`, unrelated to `#83`).
- `cargo-deny`, `go-licenses`, Rust `cargo` checks, and CycloneDX SBOM generation (not executed locally; covered by GitHub Actions CI).

## Spec

`spec/api.tsp` extends `@route("/repos")` (`namespace Repos`) with optional `mode?: "software" | "capital-projects"` and `scaffolded_dirs?: string[]` on `MaterializeRepoRequest` / `MaterializeRepoResult`, plus `CheckpointRequest`, `CheckpointResult`, `RemoveWorktreeRequest`, `RemoveWorktreeResult`, `POST /repos/checkpoint`, and `POST /repos/remove` (omitting `preserve_patterns`). Owner Ben Huffer (`@FlyFission`) approved these additive `/repos` updates in the Cycle 1 design spec and implementation plan; `spec/generated/openapi/openapi.json`, `services/api/src/preparation/schema.d.ts`, and `apps/web/src/api/schema.d.ts` are regenerated from `spec/api.tsp`. Under `.github/CODEOWNERS`, `/spec/` remains held for independent owner review by `@FlyFission`.

## Evidence custody and coupling

Author custody (implementing agent running post-edit local checks) is separated below from reviewer/merge custody (owner `@FlyFission` CODEOWNERS `/spec/` review and PR `#83` approval).

| Evidence ID | Claim ID | Decisive? | Artifact / raw result | Change actor | Generated by | Selected by | Transformed / summarized by | Executed / captured by | Retained by | Presented by | Verified / witnessed by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | T-02, T-03 | yes | evidence/spec-drift.log | Implementing agent | TypeSpec 1.18.0, openapi-typescript 7.13.0, git diff | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-02 | T-02, T-04, T-05, T-06 | yes | evidence/api-checks.log | Implementing agent | tsc, Vitest 5.1.0, PostgreSQL fixture | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-03 | T-03 | yes | evidence/web-checks.log | Implementing agent | tsc, Vitest 5.1.0, Vite | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-04 | T-01 | yes | evidence/daemon-checks.log | Implementing agent | gofmt, go vet, go test (go1.24.7) | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-05 | T-07 | yes | evidence/tools-checks.log, evidence/ng-validate.log | Implementing agent | Repository Python tools, ng.py | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-06 | T-07 | no | evidence/ci-aux-checks.log | Implementing agent | license-gate.mjs, uv, ruff, pytest | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-07 | T-08 | yes | Owner CODEOWNERS and PR review | Implementing agent | Not executed | Owner | Not executed | Not executed | Packet | Implementing agent | Not supplied |

| Evidence ID | Actor | Context | Mechanism | Authority | Resource | Classification | Admissibility / residual-risk disposition |
|---|---|---|---|---|---|---|---|
| E-01 | coupled: implementing agent ran generators and drift check | coupled: one session | separated: deterministic TypeSpec compiler and git diff | separated: owner retains spec CODEOWNERS review | coupled: local machine | self-check | Additive /repos contract only; owner /spec/ sign-off still open [Ship limits](ship.md) |
| E-02 | coupled: implementing agent wrote hardening and tests | coupled: one session | separated: Vitest and tsc against local PostgreSQL fixture and real git | separated: owner retains merge decision | coupled: local machine | self-check | Full 59-file / 728-test API suite passes post-edit [Ship limits](ship.md) |
| E-03 | coupled: implementing agent wired mode and ran checks | coupled: one session | separated: Vitest, tsc, and Vite build | separated: owner retains merge decision | coupled: local machine | self-check | Full 45-file / 624-test Web suite and 40 office contract build checks pass post-edit [Ship limits](ship.md) |
| E-04 | coupled: implementing agent ran daemon checks | coupled: one session | separated: Go toolchain against local codex-cli 0.169.0 | separated: owner retains merge decision | coupled: local machine | self-check | TestHostGit*, confinement, and digest pass; local codex-cli 0.169.0 fails TestInstalledCodexLeavesOnlyQualifiedFeatures unrelated to #83 [Ship limits](ship.md) |
| E-05 | coupled: implementing agent ran governance scripts | coupled: one session | separated: deterministic repository Python checks and ng.py | separated: owner retains merge decision | coupled: local machine | self-check | check_register.py retains only the 2 pre-existing findings in kind.ts and seals.ts [Ship limits](ship.md) |
| E-06 | coupled: implementing agent ran local license and sdk checks | coupled: one session | separated: license-gate.mjs, ruff, and pytest | separated: owner retains merge decision | coupled: local machine | self-check | Node license gate and sdk/python pass; cargo-deny and go-licenses deferred to CI [Ship limits](ship.md) |
| E-07 | separated: owner | separated: independent owner review | separated: human review and GitHub CI gate | separated: owner decides spec CODEOWNERS and merge | separated: GitHub PR #83 | self-check | Hold merge until owner completes /spec/ CODEOWNERS review and approves PR #83 [Ship limits](ship.md) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All post-edit logs (`E-01`..`E-06`) are retained in `evidence/` with exact counts and failures disclosed, `ng.py validate --strict-custody` passes across all 23 packets, and PR `#83` holds for independent owner `/spec/` CODEOWNERS review and merge (`E-07`).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
