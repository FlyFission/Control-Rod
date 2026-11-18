# Plan: workspace UI redesign and local repository materialization

1. Sync `feat/workspace-ui-redesign` (`#82`) with `origin/main` (including `#69`).
2. Add the `Repos` namespace (`GET /repos`, `POST /repos/materialize`) to `spec/api.tsp`, run `pnpm spec` and `pnpm --filter @control-rod/web gen:api`, export generated `Repos.*` types from `apps/web/src/api/types.ts`, and remove duplicate handwritten interfaces from `apps/web/src/api/client.ts`.
3. Harden `services/api/src/repos.ts` and `services/api/src/refusals.ts`: strict `isSafeRepoIdentifier`, symlink-refusing `resolveWithoutSymlinks`, non-dot `$HOME` containment in `resolveSafeWorkspaceRoot` and `isContainedIn`, `HOST_GIT_ARGS` + `hostGitEnv` (`GIT_CEILING_DIRECTORIES`) + non-persistent `gitConfigEnv` for `gh()`, `.git` validation on all materialization strategies, strict `parseGithubOwnerRepoFromUrl`, `repo-identity-mismatch` refusal, clean-tree enforcement on `branch`, and `origin`-only fetch with surfaced errors. Cover boundaries in `services/api/test/repos-materialize.test.ts`.
4. Harden `apps/web/src/lib/runtimes.ts`, `workDefaults.ts`, and `NewWorkModal.tsx`: mark only `claude` and `codex` `runnable: true`, disable unbacked CLIs, sanitize `loadWorkDefaults`, delete unused `buildClarifyingQuestions`, render `github_error`, add honest Cycle 2 deferral/custody text, fix the async `/repos/materialize` race with `prepareSeqRef` + snapshot validation, pin `preparedBranch` across `objective` edits, and update `newwork.test.tsx`.
5. Fix Board M4/P2 issues in `QuickAdd.tsx` (`CAPTURE_LIMIT` check before mutate, `batchProgress` ref for partial retries and `["captures"]` invalidation), `BoardReviewDrawer.tsx` (`key={packageId}` on `DecisionBar`), `BoardView.tsx` (J/K `button.bd-title`), `useBoardData.ts` (`capturesQ.isPending`), and `Shell.tsx` (`.palette-trigger` `sr-only` span so WCAG 2.5.3 `label-content-name-mismatch` passes axe across Looks A/B/C), alongside `styles.css` Look B/C token fixes.
6. Retain `CodexDisabledFeatures` update (`deferred_tool_world_state` for Codex `0.167.0`) in `daemon/internal/runner/sandbox.go:368` and updated launch-golden fixtures.
7. Regenerate `docs/commands/inventory.md` (`tools/generate_command_inventory.py`), update `docs/status.md` to match `#82` reality, remove the stale branch reference in `.nuclear/changes/board-m4/ship.md:5`, and create this Standard change record `.nuclear/changes/workspace-ui-redesign/` with post-edit evidence logs.
8. Run the full verification gate (TypeSpec drift, API typecheck + Vitest, Web typecheck + Vitest + build, Chromium Playwright `board-looks.spec.ts`, daemon `gofmt`/`go vet`/`go test`, Python checks, and `ng.py validate --strict-custody` on all change records) and record exact observed results.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every step above is backed by committed code and post-edit evidence logs in `evidence/`, all change records validate under `--strict-custody`, any environmental or version-skew failures are reported transparently without skipping tests, and the owner retains merge authority.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
