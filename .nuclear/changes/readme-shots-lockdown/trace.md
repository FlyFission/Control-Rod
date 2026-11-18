# Trace: lock down the README screenshot workflow

| Requirement | Change | Evidence | Disposition |
|---|---|---|---|
| RS-01 No pull request code runs with a write token. | `shots` read-only, `persist-credentials: false`; write moved to `commit`. | `evidence/yaml-parse.txt` (E-02) | implemented; awaiting signature |
| RS-02 Only checked pictures are pushed, only to the pull request's branch. | Checks in the `commit` script. | `evidence/commit-step-test.txt` (E-03) | implemented; awaiting signature |
| RS-03 No event value expanded into a script. | `HEAD_REF`, `HEAD_SHA` and `SHOTS` passed by environment. | `evidence/zizmor-before-after.txt` (E-01) | implemented; awaiting signature |
| RS-04 Bounded jobs, pinned actions. | `timeout-minutes`, download-artifact pinned by commit. | E-02 | implemented |
| RS-05 The workflow still produces and commits the pictures. | none | CI on this PR (E-04) | confirmed in CI |
| Independent signature for the workflow | none | none | open (risk R-06) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the signature for the screenshot workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
