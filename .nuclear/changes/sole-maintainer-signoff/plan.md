# Plan: sole-maintainer sign-off for trust surfaces

1. Add the exception to `AGENTS.md` rule 2 and the full conditions to `docs/collaboration.md` ([basis](basis.md)).
2. Point `CONTRIBUTING.md`, the pull request template, the change issue template and the CODEOWNERS header comment at it.
3. Record the owner's yes to #95 in the screenshot record.
4. Search every tracked statement of the signer rule and check each now agrees (`evidence/signer-rule-grep.txt`); check the changed lines have no em dash.
5. Validate the touched records with the pinned validator under `--strict-custody`.
6. Open a draft pull request, get CI green, and ask the owner for a yes to merge. On that yes, record it in this record's `Signature` table (`ship.md` is not a trust surface, so the yes still covers the pull request), wait for CI, then merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the sole-maintainer rule and its five conditions are in `AGENTS.md` and `docs/collaboration.md`, no template or CODEOWNERS line contradicts it, the screenshot record shows both owner approvals, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
