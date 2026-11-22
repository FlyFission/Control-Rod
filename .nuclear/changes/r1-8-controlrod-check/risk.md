# Risk: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-22 R1.8 prompt and review-fix pass.
- Decision owner: Ben Huffer. No protected surface (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, `kernel/`) is modified.
- Scope: `daemon/internal/runner/check.go`, `daemon/internal/runner/check_test.go`, `daemon/cmd/controlrod/main.go`, `daemon/cmd/controlrod/main_test.go`, `services/api/src/pr-receipt.ts`, `services/api/test/pr-receipt.test.ts`, `scripts/cr.mjs`, `packages/check-action/action.yml`, `packages/check-action/README.md`, `docs/threat-model.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Same vendor family or unknown/multi-vendor runtime checks its own family's diff, or `canClaimBlind` fails open on aliases/unknown providers. | `DistinctFamily` (Go) and `normalizeProvider` + `distinctFamily` (TS) enforce the exact fixed-vendor table from `services/api/src/runtimes.ts` and fail closed when author or checker family is unknown or matches. Standalone checks label `--author-runtime` as `(caller-declared, unverified)`. | Any check or receipt claims blind checking with matching or unknown vendor family, or presents caller-declared author as verified. |
| R-02 | Untrusted PR diff, repo git config, `.gitattributes`, symlinked parents, or PR-edited criteria hijacks `controlrod check` or the GitHub Action. | Diff extraction uses `HostGitCommand` with `--no-ext-diff --no-textconv --text --end-of-options`; criteria can be read from the base ref via `--criteria-ref` (`criteria-from-base: "true"` by default in `action.yml`); local file reads walk every component with `readCappedNoSymlinkParents`; checker runs under `PrepareChecker`, `applyCheckerMount`, `CheckerAdmissionJob`, `Container` + `SpawnReceipt`, and `settleChecker`; contradictory `pass` verdicts with `major`/`critical` findings are refused. | Checker runs without `PrepareChecker`/sandbox mount, reads PR-head criteria by default, follows symlinked parents, or skips process ownership receipts. |
| R-03 | A PR receipt claims human passkey acceptance from an unsealed bundle, non-human actor, stale/superseded decision, or mismatched revision, or injects live Markdown/HTML. | `prReceiptFromBundleText` calls `verifyInclusion` first, claims human acceptance only when `authenticated === true`, `actor.kind === "human"`, `decision` + `subject_digest` are present, revision matches pre-check, and no later reject/return/edit supersedes it; unsealed bundles display a prominent unauthenticated banner; standalone receipts explicitly state no human acceptance and no `pnpm cr verify` inclusion proof; untrusted strings escape HTML, `@mentions`, links, and cap finding length. | Any receipt claims human acceptance or `pnpm cr verify` backing without authenticated underlying evidence. |
| R-04 | Bypass, skip-permissions, or auto-approve flags are introduced, or Action control flow swallows errors or skips verdict enforcement. | All launches go through `Command` in `daemon/internal/runner/runtime.go` with `DefaultCheckerSandboxPolicy()` and `VerifyPolicy`; `action.yml` uses `set +e` around the CLI call, caps/warns on comment failure without blocking `Enforce verdict` (`if: always()`), and never lets `fail-on-fail=false` mask exit `2` or `outcome=error`. | Any bypass flag appears, or an infrastructure error exits 0 under `fail-on-fail=false`. |

## Selected mode

- **Mode:** Standard
- Basis: adds a standalone CLI subcommand, reusable composite Action package, PR receipt formatter, and threat model row without altering protected trust surfaces or database schemas.

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
