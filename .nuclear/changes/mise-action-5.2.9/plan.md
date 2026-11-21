# Plan: mise-action v5.2.9 pin bump

1. Merge `main` into the Dependabot branch so CI runs on the current base (the branch head was last pushed by a workflow token, which does not start CI).
2. Retain the workflow diff against `main` and check that it holds only pin lines.
3. Record the owner's yes in the Signature table, then squash-merge once CI is green.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sign-off rule: [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Exit criteria

The `jdx/mise-action` pin is v5.2.9 in `ci.yml` and `readme-shots.yml`, CI is green on the pull request's head, the owner's yes is recorded in the Signature table, and nothing else in `.github/` changes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
