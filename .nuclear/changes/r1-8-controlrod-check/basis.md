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

## Open questions for Ben (not decided here; code fails closed)

1. What a standalone `controlrod check` / GitHub Action receipt may claim when no person has accepted the change. Until decided, standalone output never claims verified human acceptance.
2. The label for an author the caller declares via `--author-runtime` and nobody verified (currently `caller-declared, unverified`).
3. Which trust anchors identify a person's seal key when verifying offline bundles. Until decided, a bundle-supplied key is reported as `UNVERIFIED SEAL KEY` / `bundle-key-only`.

## Verification limits (what the code enforces)

- Offline `pnpm cr verify --receipt` / `--revision` / `--diff-sha256` requires a valid 64-hex diff digest and fails otherwise; the digest must appear among the accepted deliverable digests in the authenticated bundle, and the acceptance must cover the stated revision.
- The receipt's `package_id` must equal the bundle's package ID (a receipt with no package ID fails). A `head_sha` the bundle records must match the receipt's or verification fails. Platform events do not record head SHAs, so when the bundle records none (or the receipt names none) the remaining fields are verified and the result says "not head-bound"; the Action then reports `proof-verified=true-not-head-bound`. Head binding is claimed only when a recorded commit matches. No head recording was added.
- The bundle's pre-check checker, verdict and acceptance criteria are **not** bound to a standalone check's checker, verdict or criteria. The Action therefore does not append a "Verified Control Rod acceptance" section to a standalone check receipt; it appends a note that the proof is not bound to this check. The `proof-verified` output means authenticity plus diff/revision/head coverage, not verified acceptance of this check.
- The Action does not build the offline verifier (`services/api/dist/verify-bundle.js`). With `inclusion-proof` set and the verifier missing, the proof is reported as not verified and the step fails with instructions to run `pnpm --filter @control-rod/api build` or set `CONTROLROD_VERIFY_JS`.
- The standalone Action not proving acceptance of its own check (its checker, verdict and criteria are not bound to the bundle) is the intended "stop claiming" outcome and is tied to open question 1.
- Receipt mode decides governed versus standalone from the binding marker's own contents, not the Markdown: only a marker with `"standalone":true` (what `controlrod check` emits) or a bare JSON verdict is exempt, and an exempt receipt fails if it names a package, writer or accepting person. Every other receipt is regenerated with `formatPrReceipt` and compared. It requires the whole receipt (line endings and trailing whitespace normalised) to equal the regenerated receipt line for line, with only the bundle path token inside the `Verify offline` command masked (the rest of that line, including seal and trust warnings and the bundle digest, must match); extra lines, fenced copies and edits fail. Only patch outputs and head commits recorded in the accepted pre-check's own round bind as the diff and head; a round with no patch has no diff binding. Claim lines (package, writer, checker and verdict, accepted-by, and the unauthenticated/unverified-key banners) to match exactly, so an edited verdict, checker or accepting person fails. Standalone `controlrod check` receipts and verdict JSON have no such block and are checked only on their binding fields. Explicit `--revision`/`--diff-sha256`/`--head-sha` must agree with the receipt's binding or verification fails; they never override it.
- Only an author output named `*.patch` or `*.diff` (or an explicit `diff_sha256` field) counts as the PR diff. Otherwise no diff binding is emitted, the receipt says so, and verification fails for lack of a diff digest. The repo records no other patch-name convention.
- With `diff-file` the Action attaches no head SHA (the file is not tied to a commit) and appends "Diff file, head not verified" to the receipt. Head binding exists only in git mode.
- A human-accepted bundle receipt carries a `controlrod-check-binding` marker (package, revision, single recorded diff digest, single recorded head if any) and prints `pnpm cr verify --receipt pr-receipt.md <bundle>`; a round-trip test verifies a generated receipt against its bundle. When the bundle records no single diff digest, the marker is omitted and the plain bundle-only command is printed. `--revision 0` is accepted (packages start at revision 0).
- `controlrod check` diffs the resolved base/head commit SHAs, not the original refs, and signs its attestation ID with the actual `--revision` (default 1).
- `controlrod check` refuses `--head-sha` together with `--base`/`--head`; the head commit comes from git in ref mode. In Action git mode `head-ref` defaults to `github.event.pull_request.head.sha` (passed via env), else `HEAD`.

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
