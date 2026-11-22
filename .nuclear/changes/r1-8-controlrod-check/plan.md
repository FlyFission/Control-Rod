# Plan: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

1. Create this change record under `.nuclear/changes/r1-8-controlrod-check/` before editing code.
2. Add `daemon/internal/runner/check.go` and `daemon/cmd/controlrod/main.go` (`check` subcommand):
   - Enforce vendor-family independence (`DistinctFamily`, mirroring `services/api/src/runtimes.ts`).
   - Extract diff from `--diff` (file or stdin) or `--base`/`--head` via `HostGitCommand` (`git_host.go`).
   - Reuse `VerifyPolicy`, `Preflight`, `PrepareChecker`, `Command`, `VerifyLaunch`, `CheckerAdmissionJob`, `applyCheckerMount`, `Execute`, `settleChecker`, `ObservedModelsAllowed`, and `BuildCheckerAttestation` (falling back to explicit unattested status when OS keychain is absent in standalone CLI mode, never faking a signature).
   - Print verdict as `text`, `json`, or `markdown` (PR receipt), with optional `--receipt-out` and `--verdict-out`.
3. Add `services/api/src/pr-receipt.ts`, `pnpm cr receipt` wiring (`services/api/src/verify-bundle.ts`, `scripts/cr.mjs`), and tests (`services/api/test/pr-receipt.test.ts`).
4. Add reusable composite GitHub Action package under `packages/check-action/` (`action.yml` and `README.md`) without touching `.github/workflows/`.
5. Add the threat model row to `docs/threat-model.md`.
6. Write unit and integration tests (`daemon/internal/runner/check_test.go`, `daemon/cmd/controlrod/main_test.go`, `services/api/test/pr-receipt.test.ts`), run all affected suites and repo gates, capture verification evidence, and update `trace.md`, `verification.md`, and `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. `controlrod check` runs the blind checker on a diff (file, stdin, or `HostGitCommand` git diff) plus acceptance criteria (file, inline, or base git ref via `--criteria-ref`) using a different vendor family from the caller-declared author, reusing existing checker confinement/admission/ownership/settlement code, and prints the verdict (`0` pass, `1` fail/inconclusive, `2` refusal/invalid input).
2. `packages/check-action/action.yml` ships a self-contained reusable composite GitHub Action invoking `controlrod check` (reading criteria from base ref by default, capturing nonzero verdicts cleanly, isolating comment errors, and failing on infrastructure errors) with no `.github/workflows/` edits, no secrets leaked to agent env, and no scheduled triggers.
3. `services/api/src/pr-receipt.ts` (and `pnpm cr receipt`) formats honest PR receipts for Control Rod packages/bundles verified via `verifyInclusion` (requiring authenticated seal, human actor, matching revision, and latest non-superseded decision), while standalone CLI/Action runs emit unaccepted standalone summaries pending Ben's decision on standalone receipt wording and R2.5 PR opening.
4. `docs/threat-model.md` includes the R1.8 threat model row.
5. Go, TypeScript, and repository checks pass (noting any environment-only pre-existing failures).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
