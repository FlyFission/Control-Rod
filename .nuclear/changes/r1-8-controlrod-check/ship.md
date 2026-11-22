# Ship: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

Release decision: **draft PR pending blind checker, Ben's product decisions on standalone receipt/author labelling, and owner review.**

- **Proposed:** `controlrod check` CLI, reusable composite GitHub Action under `packages/check-action/`, bundle PR receipt formatter and `pnpm cr receipt`, and the R1.8 threat model row.
- **Not claimed:** that `.github/workflows/` runs the Action yet (protected path; left untouched for owner sign-off), that standalone CLI/Action checks carry human passkey acceptance or a `pnpm cr verify` inclusion proof, that `--author-runtime` in standalone mode is verified rather than caller-declared, that an offline bundle verified only against a bundle-supplied key proves key ownership or per-decision WebAuthn passkey acceptance without external `trustedSealKeys` + decision assertions, that `packages/check-action/action.yml` was executed on a live GitHub Actions runner, or that live Claude Code / Codex runs were executed in this session.
- **Known limits (out of scope for R1.8, tracked separately):**
  - The Linux checker sandbox leaves non-home paths readable, mirroring [sandbox.ts](../../services/api/src/sandbox.ts); restricting non-home OS-level egress belongs to rows R3.10 and R3.11.
  - Claude Code vendor telemetry in `daemon/internal/runner/adapter_claude.go` pre-dates R1.8 and is tracked separately.
- **Open product questions for Ben:**
  1. What a standalone `controlrod check` / GitHub Action receipt may claim when no person has accepted the change and no inclusion proof exists for `pnpm cr verify`.
  2. How an author identity the caller declared via `--author-runtime` (and nobody verified) should be labelled (`caller-declared, unverified` vs dropping the author line or requiring attested author runs).
  3. Which external trust anchors should identify a person's key when verifying offline bundles (`pnpm cr verify` / `pnpm cr receipt`): e.g. enrolled `key_digest`s exported from Control Rod org state, an owner-signed keyring / Sigstore-style identity mapping, or requiring inclusion of the per-decision WebAuthn assertion?
- **Next steps needing the owner's yes (trust surfaces):** wiring `packages/check-action/` into `.github/workflows/` when ready; integrating `formatPrReceipt` into Control Rod's `Create PR` workflow (R2.5).

Rollback: revert the branch commit(s). No database migrations, `spec/` changes, or kernel changes are included.

Monitoring after merge: `daemon/internal/runner/check_test.go`, `daemon/cmd/controlrod/main_test.go`, and `services/api/test/pr-receipt.test.ts` must continue to pass whenever checker isolation, vendor-family rules, or inclusion bundles change.

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
