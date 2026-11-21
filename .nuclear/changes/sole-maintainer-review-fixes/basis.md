# Basis: answer the review of the sole-maintainer rule

**Change slug:** `sole-maintainer-review-fixes`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-19
**Decision this basis supports:** whether to record the sole-maintainer rule as an ADR and close the five points Copilot raised on #97 after it merged.

## Mission / need

#97 merged at 608c189 on the owner's yes. Copilot then reviewed it and raised five points, each checked against the tree:

1. The screenshot record claimed its approvals met the new rule while its `Signature` table stayed empty, which condition 3 does not allow. True.
2. ADR 0001 says every significant decision is an ADR signed by a maintainer who did not author it; #97 changed that rule without an ADR. True.
3. The question for #97 named "the repo's trust rules" but not the `.github/` files it changed, while condition 1 asked for a question that "says it touches a trust surface". True as far as naming the files.
4. The sign-off record's exit criteria said CI was green while E-04 was still `pending`. True.
5. `AGENTS.md` rule 2 named `.github/workflows/` and left out the rest of `.github/` and `docs/adr/`, which CODEOWNERS covers. True, and older than #97.

## What changes

- New ADR 0024 records the decision; ADR 0001 gains an "Amended by" line.
- `AGENTS.md`, `CONTRIBUTING.md` and both templates list all of `.github/` and `docs/adr/` as trust surfaces.
- Condition 1 now asks for a question that names each trust surface the pull request changes, by path or in plain words.
- The screenshot record's `Signature` table holds both owner approvals, and its stale "unsigned" wording is gone.
- The sign-off record's E-04 cites the real CI runs, and its `ship.md` notes the limit of the #97 question.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-04 are met: ADR 0024 records the decision and ADR 0001 points to it, the trust-surface lists match CODEOWNERS, condition 1 names each trust surface, and the screenshot and sign-off records carry their signatures and real CI evidence; CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
