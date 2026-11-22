# Basis: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

**Change slug:** `r1-8-controlrod-check`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-22
**Decision this basis supports:** whether R1.8 (`controlrod check` CLI, reusable GitHub Action package, PR receipt generator, and threat model row) is accepted without touching `.github/workflows/` or parallel R1.1 files.

## Mission / need

Plan row R1.8 introduces the standalone blind checker outside the full Control Rod web/database stack (`controlrod check` CLI and a reusable GitHub Action) plus the PR receipt block so every PR carries verifiable provenance (`written by one agent, checked blind by another, accepted by a person, verifiable offline with pnpm cr verify`).

## Scope

In scope:
- `daemon/internal/runner/check.go` and `daemon/internal/runner/check_test.go`: standalone blind checker runner (`RunCheck`), vendor-family independence (`DistinctFamily` matching `services/api/src/runtimes.ts`), `HostGitCommand` diff extraction, reuse of `PrepareChecker`, `Command`, `VerifyLaunch`, `CheckerAdmissionJob`, `applyCheckerMount`, `Execute`, `settleChecker`, `ObservedModelsAllowed`, and `BuildCheckerAttestation`, plus text/JSON/Markdown receipt formatting.
- `daemon/cmd/controlrod/main.go` and `daemon/cmd/controlrod/main_test.go`: `controlrod check` CLI subcommand and exit-code handling (`0` pass, `1` fail/inconclusive/run error, `2` usage/refusal).
- `services/api/src/pr-receipt.ts`, `services/api/test/pr-receipt.test.ts`, `services/api/src/verify-bundle.ts`, `scripts/cr.mjs`: PR receipt formatter and offline inclusion-proof-to-receipt generator (`pnpm cr receipt <bundle.json>`) built on `verifyInclusion`.
- `packages/check-action/action.yml` and `packages/check-action/README.md`: reusable composite GitHub Action package invoking `controlrod check`.
- `docs/threat-model.md`: threat model row covering standalone `controlrod check` / GitHub Action untrusted-PR checking and forged or unauthenticated PR receipts.
- This change record under `.nuclear/changes/r1-8-controlrod-check/`.

Out of scope:
- `.github/workflows/` (protected path; requires maintainer sign-off before wiring the reusable action into this repository's CI).
- `daemon/internal/runner/workspace.go`, `services/api/src/repos.ts`, `spec/` (owned by parallel R1.1 work; untouched).
- `policies/`, `tests/redteam/`, `kernel/`, `docs/adr/` (untouched).
- Bypass, skip-permissions, or auto-approve flags for any launched agent CLI; telemetry or scheduled jobs.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Implement R1.8 standalone CLI, reusable Action package, PR receipt, and threat model row without touching `.github/workflows/` | "plan row R1.8 ONLY — the controlrod check CLI and the PR receipt. The CLI runs the blind checker on any diff plus its acceptance criteria and prints the verdict. Ship the GitHub Action as a separate reusable package (for example an action.yml in a package directory); do NOT create or edit anything under .github/workflows/. Add the threat model row the plan calls for." | 2026-11-22, session prompt and Nov 22 plan | Build `controlrod check` in `daemon/cmd/controlrod` + `daemon/internal/runner`, ship the GitHub Action under `packages/check-action/`, provide PR receipt formatting/generation, and add the R1.8 row to `docs/threat-model.md`. | Editing `.github/workflows/`, `policies/`, `tests/redteam/`, `kernel/`, `spec/`, or parallel R1.1 files (`workspace.go`, `repos.ts`). |
| D2 | Use `packages/check-action/` for the reusable Action package and reuse `services/api/src/pr-receipt.ts` + `pnpm cr receipt` for bundle receipts | none: authoring agent's choice, open to the owner | 2026-11-22, implementation choice | Placing the composite action at `packages/check-action/action.yml` keeps it decoupled from `.github/workflows/` and `deploy/`; adding `pr-receipt.ts` and `pnpm cr receipt` makes PR receipts available both to future PR creation (R2.5) and to offline bundles today. | Automatic PR posting inside `services/api/src/repos.ts` (deferred to R2.5). |

## Fixed inputs

1. `AGENTS.md` rules 1–6 and the Nov 22 handoff plan (R1.8).
2. Existing checker isolation and admission code in `daemon/internal/runner/checker.go`, `runtime.go`, `sandbox.go`, `attest.go`, `git_host.go`, `artifact.go`, and `keystore.go`.
3. Existing family matrix and offline proof verification in `services/api/src/runtimes.ts`, `services/api/src/seals.ts`, and `services/api/src/verify-bundle.ts`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Vendor-family independence rules in `daemon/internal/runner` mirror `services/api/src/runtimes.ts` (`claude` -> Anthropic, `codex` -> OpenAI, `grok` -> xAI, `agy` -> Google, `fake` -> Test; multi-vendor harnesses refused). | `services/api/src/runtimes.ts` lines 28–41. | A runtime family mapping changes in `runtimes.ts` without updating `DistinctFamily` in Go. |
| Standalone CLI / GitHub Action runners may lack an OS keychain (`SigningKey()`). | `daemon/internal/runner/keystore.go` requires keychain or `CONTROLROD_ALLOW_FAKE=1` test key. | Requiring every standalone run to hold a pre-initialized OS keychain; if so, fail closed when keychain is absent instead of emitting an unattested standalone receipt. |

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
