# Ship: controlrod check CLI, reusable GitHub Action, and PR receipt (R1.8)

Release decision: **draft PR pending blind checker and owner review.**

- **Proposed:** `controlrod check` CLI, reusable composite GitHub Action under `packages/check-action/`, PR receipt formatter and `pnpm cr receipt`, and the R1.8 threat model row.
- **Not claimed:** that `.github/workflows/` runs the Action yet (protected path; left untouched for owner sign-off), that standalone CLI checks carry passkey acceptance or an inclusion proof, or that live Claude Code / Codex runs were executed in this session unless explicitly recorded in `verification.md`.
- **Next steps needing the owner's yes (trust surfaces):** wiring `packages/check-action/` into `.github/workflows/` when ready.

Rollback: revert the branch commit(s). No database migrations, `spec/` changes, or kernel changes are included.

Monitoring after merge: `daemon/internal/runner/check_test.go`, `daemon/cmd/controlrod/main_test.go`, and `services/api/test/pr-receipt.test.ts` must continue to pass whenever checker isolation, vendor-family rules, or inclusion bundles change.

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
