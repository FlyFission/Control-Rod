# Trace: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R18-1 | `controlrod check` enforces a different vendor family from the author and rejects same/unknown families. | E-01 (`TestDistinctFamilyEnforcesIndependentVendors`, `TestRunCheckRefusesSameVendorAndBadInputs`) | done |
| R18-2 | `controlrod check` runs the blind checker on diff + acceptance criteria reusing existing checker workspace, mount, admission, execution, and settlement code, and prints verdict/receipt. | E-01 (`TestRunCheckWithFakeRuntimePassFailInconclusive`, `TestRunCheckCLIExitCodesAndOutputs`, `TestDefaultCheckerSandboxPolicyPassesVerifyPolicy`, `TestNoRuntimeNameSwitch`) | done |
| R18-3 | Diff extraction from git uses `HostGitCommand` to neutralize repo hooks/filters. | E-01 (`TestRunCheckGitDiffUsesHostGitCommandAndNeutralizesFilters`) | done |
| R18-4 | Reusable GitHub Action lives in `packages/check-action/action.yml` with no `.github/workflows/` edits. | E-03 (`packages/check-action/action.yml` YAML validation, `git status`) | done |
| R18-5 | PR receipt formatter & offline bundle receipt command produce honest receipts backed by `verifyInclusion` and `pnpm cr verify`. | E-02 (`services/api/test/pr-receipt.test.ts`, `services/api/test/verify-bundle.test.ts`) | done |
| R18-6 | Threat model row added to `docs/threat-model.md`. | E-03 (`docs/threat-model.md`) | done |
| R18-7 | Independent blind checker + maintainer review. | E-04 | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. `controlrod check` runs the blind checker on a diff (file, stdin, or `HostGitCommand` git diff) plus acceptance criteria using a different vendor family from the author, reusing existing checker confinement/admission/settlement code, and prints the verdict (`0` pass, `1` fail/inconclusive, `2` refusal/invalid input).
2. `packages/check-action/action.yml` ships a self-contained reusable composite GitHub Action invoking `controlrod check` with no `.github/workflows/` edits, no secrets leaked to agent env, and no scheduled triggers.
3. `services/api/src/pr-receipt.ts` (and `pnpm cr receipt`) formats honest PR receipts for Control Rod packages/bundles (verifiable via `pnpm cr verify`) and standalone checks.
4. `docs/threat-model.md` includes the R1.8 threat model row.
5. Go, TypeScript, and repository checks pass (noting any environment-only pre-existing failures).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
