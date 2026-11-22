# Trace: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R18-1 | `controlrod check` enforces a different vendor family from the caller-declared author, rejects same/unknown families, and labels the author as caller-declared/unverified. | E-01 (`TestDistinctFamilyEnforcesIndependentVendors`, `TestRunCheckRefusesSymlinkedParentsAndBadInputs`, `TestRunCheckWithFakeRuntimePassFailInconclusive`) | done (wording open to Ben) |
| R18-2 | `controlrod check` runs the blind checker on diff + acceptance criteria reusing existing checker workspace, mount, admission, `Container`/`SpawnReceipt` ownership, execution, and settlement code, rejects contradictory `pass` verdicts with `major`/`critical` findings, and sanitizes/caps output. | E-01 (`TestRunCheckWithFakeRuntimePassFailInconclusive`, `TestRunCheckCLIExitCodesAndOutputs`, `TestDefaultCheckerSandboxPolicyPassesVerifyPolicy`, `TestNoRuntimeNameSwitch`) | done |
| R18-3 | Diff extraction and `--criteria-ref` use `HostGitCommand` (`--no-ext-diff --no-textconv --text --end-of-options`), bound memory via streaming `runGitOutputCapped` (`io.LimitReader` + child kill on overflow), neutralize repo textconv/filters and `-diff` hiding, and reject symlinked parent directories. | E-01 (`TestRunCheckGitDiffNeutralizesTextconvOverridesAndReadsBaseCriteria`, `TestRunCheckGitDiffBoundsMemoryOnOversizedDiff`, `TestRunCheckRefusesSymlinkedParentsAndBadInputs`) | done |
| R18-4 | Reusable GitHub Action lives in `packages/check-action/action.yml` with no `.github/workflows/` edits, isolates per-invocation files via `mktemp -d`, reads criteria from base ref by default (`criteria-from-base: "true"`), preserves nonzero verdicts under `set +e`, isolates PR comment failures, and fails on infrastructure/execution errors (`has-error`) even when `fail-on-fail=false`. | E-03 (`packages/check-action/action.test.mjs`, YAML validation, `git status`) | done |
| R18-5a | Bundle PR receipt formatter & `pnpm cr receipt` normalize control-plane role-prefixed actor IDs, credit authorship only on `run.succeeded` (with outputs) or `package.output`, distinguish unverified bundle-key seals (`UNVERIFIED SEAL KEY`) from external `trustedSealKeys` seals and true `passkeyVerified` assertions, verify `actor.kind === "human"`, matching revision/round, latest decision, and digest binding. | E-02 (`services/api/test/pr-receipt.test.ts`, `services/api/test/verify-bundle.test.ts`) | done (trust-anchor question open to Ben) |
| R18-5b | Standalone CLI/Action PR receipt for unaccepted diffs without Control Rod inclusion proof (`pnpm cr verify` does not apply); full Control Rod PR opening deferred to R2.5. | E-01, E-02 | partial (awaits Ben's decision on standalone receipt claims; R2.5 wires PR opening) |
| R18-6 | Threat model row added to `docs/threat-model.md`. | E-03 (`docs/threat-model.md`) | done |
| R18-7 | Independent blind checker + maintainer review. | E-04 | open |

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
