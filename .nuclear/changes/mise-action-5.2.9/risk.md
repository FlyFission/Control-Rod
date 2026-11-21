# Risk: mise-action v5.2.9 pin bump

- **Mode:** Standard
- Execution owner: Dependabot (the bump) and the readme-shots workflow (the screenshot); this packet by Claude Code for the owner.
- Decision owner: Ben Huffer. Trust surface touched: `.github/workflows/`, signed under sole-maintainer sign-off (see [ship](ship.md)).
- Scope: see [basis](basis.md).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The new action version breaks a CI job. | Every CI job runs on the PR head with the new pin (E-01). | Any red job. |
| R-02 | The pin points at a commit other than the upstream release. | Pinned by full SHA; the PR lists it as the v5.2.9 release commit. | A SHA that does not match the upstream release. |
| R-03 | Something else in `.github/` changes with the bump. | The workflow diff against `main` is retained and holds only `mise-action` pin lines (E-02). | Any other line in the diff. |

## Selected mode

- **Mode:** Standard
- Basis: a pinned third-party action version in CI.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sign-off rule: [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Exit criteria

The `jdx/mise-action` pin is v5.2.9 in `ci.yml` and `readme-shots.yml`, CI is green on the pull request's head, the owner's yes is recorded in the Signature table, and nothing else in `.github/` changes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
