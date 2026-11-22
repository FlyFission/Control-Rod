# Risk: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-22 R1.8 prompt.
- Decision owner: Ben Huffer. No protected surface (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, `kernel/`) is modified.
- Scope: `daemon/internal/runner/check.go`, `daemon/internal/runner/check_test.go`, `daemon/cmd/controlrod/main.go`, `daemon/cmd/controlrod/main_test.go`, `services/api/src/pr-receipt.ts`, `services/api/src/verify-bundle.ts`, `services/api/test/pr-receipt.test.ts`, `scripts/cr.mjs`, `packages/check-action/action.yml`, `packages/check-action/README.md`, `docs/threat-model.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Same vendor family or unknown/multi-vendor runtime checks its own family's diff. | `DistinctFamily` enforces the exact fixed-vendor table from `services/api/src/runtimes.ts` and fails closed when author or checker family is unknown or matches. | Any check runs with matching or unknown vendor family. |
| R-02 | Untrusted PR diff, repo git config, or planted instruction files hijack `controlrod check` or the GitHub Action. | Diff extraction uses `HostGitCommand`; checker inputs go through `PrepareChecker`, `applyCheckerMount`, `CheckerAdmissionJob`, and `settleChecker`; Action passes untrusted values via `env:` instead of raw `${{ ... }}` bash interpolation and never injects API/GH tokens into the agent environment. | Checker runs without `PrepareChecker`/sandbox mount, or `${{ inputs.* }}` is interpolated into a bash script body. |
| R-03 | A standalone PR receipt claims human acceptance or offline proof verification that never occurred, or a bundle receipt diverges from `verifyInclusion`. | `prReceiptFromBundleText` calls `verifyInclusion` first and refuses failing bundles; standalone receipts explicitly state `not accepted in Control Rod (standalone check)` and `no Control Rod event chain`; untrusted strings are sanitized. | Any receipt claims acceptance or `pnpm cr verify` backing without underlying evidence. |
| R-04 | Bypass, skip-permissions, or auto-approve flags are introduced for CLI convenience. | All launches go through `Command` in `daemon/internal/runner/runtime.go` with `DefaultCheckerSandboxPolicy()` and `VerifyPolicy`. | Any bypass/skip-permissions/auto-approve flag appears in `daemon/` or `packages/check-action/`. |

## Selected mode

- **Mode:** Standard
- Basis: adds a standalone CLI subcommand, reusable composite Action package, PR receipt formatter, and threat model row without altering protected trust surfaces or database schemas.

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
