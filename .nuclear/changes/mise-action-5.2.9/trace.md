# Trace: mise-action v5.2.9 pin bump

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Every CI job passes with the v5.2.9 pin. | CI on the PR head | checked in CI (E-01) |
| T-02 | Only the `mise-action` pin lines change in `.github/`. | `evidence/workflow-diff.patch` | checked (E-02) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sign-off rule: [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Exit criteria

The `jdx/mise-action` pin is v5.2.9 in `ci.yml` and `readme-shots.yml`, CI is green on the pull request's head, the owner's yes is recorded in the Signature table, and nothing else in `.github/` changes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
