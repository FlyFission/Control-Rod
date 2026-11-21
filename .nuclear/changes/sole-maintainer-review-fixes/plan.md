# Plan: answer the review of the sole-maintainer rule

1. Verify each of the five review points against `main` at 608c189 ([basis](basis.md)).
2. Add ADR 0024 and the "Amended by" line in ADR 0001.
3. Align the trust-surface lists in `AGENTS.md`, `CONTRIBUTING.md` and both templates; reword condition 1.
4. Fill the screenshot record's `Signature` table and clear its stale wording; cite the CI runs in the sign-off record.
5. Validate every touched record under `--strict-custody`; open a draft pull request; get CI green.
6. Ask the owner a question that names this pull request and each trust surface it changes (`AGENTS.md` rule 2, `docs/adr/`, the `.github/` templates), and that also asks him to confirm the `.github/` edits #97 made. On his yes, record it in this record's `Signature` table, wait for CI, and merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-04 are met: ADR 0024 records the decision and ADR 0001 points to it, the trust-surface lists match CODEOWNERS, condition 1 names each trust surface, and the screenshot and sign-off records carry their signatures and real CI evidence; CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
