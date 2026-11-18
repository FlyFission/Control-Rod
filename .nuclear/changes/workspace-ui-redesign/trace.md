# Trace: workspace UI redesign and local repository materialization

| ID | Requirement | Tests / checks | Disposition |
|---|---|---|---|
| T-01 | `spec/api.tsp` defines `Repos` (`GET /repos`, `POST /repos/materialize`) and regenerates `spec/generated/`, `services/api/src/preparation/schema.d.ts`, and `apps/web/src/api/schema.d.ts` with no drift; `apps/web/src/api/{types.ts,client.ts}` use generated types. | `pnpm spec`, `pnpm --filter @control-rod/web gen:api`, `git diff --exit-code`, `tsc --noEmit` | implemented and verified (`evidence/spec-drift.log`, `evidence/web-checks.log`) |
| T-02 | `repos.ts` enforces safe identifiers (`isSafeRepoIdentifier`), refuses symlinks (`resolveWithoutSymlinks`), rejects `$HOME` and dot-prefixed `$HOME` subdirs (`resolveSafeWorkspaceRoot`), and enforces strict containment (`isContainedIn`). | `services/api/test/repos-materialize.test.ts` (24 tests) | implemented and verified (`evidence/api-checks.log`) |
| T-03 | `repos.ts` isolates host Git/GitHub calls (`HOST_GIT_ARGS`, `hostGitEnv` with `GIT_CEILING_DIRECTORIES`, `gitConfigEnv` via `GIT_CONFIG_*` env vars), validates `.git` inside `workspaceRoot` across all strategies, verifies strict GitHub origin identity (`repo-identity-mismatch` in `refusals.ts`), requires clean trees for `branch`, and surfaces fetch errors. | `services/api/test/repos-materialize.test.ts`, `services/api/test/refusals.test.ts` (6 tests) | implemented and verified (`evidence/api-checks.log`) |
| T-04 | `runtimes.ts`, `workDefaults.ts`, and `NewWorkModal.tsx` disable non-runnable CLIs, validate stored defaults, delete `buildClarifyingQuestions`, display `github_error`, disclose Cycle 2 daemon binding deferral, prevent stale `/repos/materialize` overwrites (`prepareSeqRef`), and pin `preparedBranch` across `objective` edits. | `apps/web/src/components/newwork.test.tsx`, `pnpm --filter @control-rod/web test` | implemented and verified (`evidence/web-checks.log`) |
| T-05 | Board P2 fixes: `QuickAdd` paste `CAPTURE_LIMIT` validation and `batchProgress` partial-retry + `captures` invalidation; `BoardReviewDrawer` `key={packageId}`; `BoardView` `button.bd-title` J/K selector; `useBoardData` `capturesQ.isPending`. | `apps/web/src/features/board/quick-add.test.tsx`, `board.test.tsx` | implemented and verified (`evidence/web-checks.log`) |
| T-06 | `styles.css` Look A/B/C token contrast and `Shell.tsx` `.palette-trigger` `sr-only` accessibility fix pass unit contrast checks and Chromium Playwright WCAG 2.2 A/AA axe scans. | `src/design/contrast.test.ts`, `src/places/places.test.tsx`, `e2e/board-looks.spec.ts` (3 looks) | implemented and verified in Chromium (`evidence/web-checks.log`, `evidence/playwright-board-chromium.log`); Firefox/WebKit not run |
| T-07 | `daemon/internal/runner/sandbox.go:368` disables `deferred_tool_world_state` for Codex `0.167.0` with updated launch-golden fixtures. | `gofmt -l .`, `go vet ./...`, `go test ./...` | implemented; `gofmt`/`go vet`/confinement/digest pass; `TestInstalledCodexLeavesOnlyQualifiedFeatures` fails locally on `codex-cli 0.169.0` (`evidence/daemon-checks.log`) |
| T-08 | `docs/commands/inventory.md` matches `services/api/src`; `docs/status.md` reflects `#82` without over-claiming; `.nuclear/changes/board-m4/ship.md:5` drops stale branch `claude/clever-pasteur-cqsq13`. | `tools/generate_command_inventory.py --check`, `tools/check_public_claims.py`, `tools/check_originality.py`, `tools/check_redteam.py`, `tools/check_register.py`, `ng.py validate --strict-custody` | implemented and verified (`evidence/tools-checks.log`, `evidence/ng-validate.log`); `check_register.py` shows only 2 pre-existing findings |
| T-09 | Independent CODEOWNERS review of `/spec/` and PR `#82` merge decision by owner (`@FlyFission`). | Owner PR review | open; held for owner |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All requirements `T-01`..`T-08` have post-edit evidence logs and exact status disclosures; `T-09` awaits owner review and merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
