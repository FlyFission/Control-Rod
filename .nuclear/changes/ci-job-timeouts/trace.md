# Trace: bounded timeouts for every CI job

| Requirement | Change | Evidence | Disposition |
|---|---|---|---|
| CT-01 Every job in `ci.yml` has an integer `timeout-minutes` from 1 to 60. | Seven `timeout-minutes` lines in `.github/workflows/ci.yml`. | `evidence/yaml-parse.txt`, `evidence/checker-before-after.txt` (E-01, E-02). | implemented; awaiting signature |
| CT-02 A job added later without a timeout fails the `change-records` job. | New last step in `change-records`: `python3 tools/check_workflow_timeouts.py`. | `evidence/checker-before-after.txt` shows the same command exiting 1 on the original file; CI run 44319665384 on this PR ran the step and it passed (E-05). | implemented and confirmed in CI; awaiting signature |
| CT-03 The caps leave a margin over observed job time. | Cap values in the diff. | `evidence/job-times.txt` (E-03): 7.8 to 47.4 times the worst of 7 runs. | caps are the signer's choice |
| CT-04 No other workflow change. | none | `evidence/diff-shape.txt` (E-04): 9 lines added, 0 removed. | confirmed |
| Independent signature | none | none | open: needs a maintainer who did not author this change (risk R-06) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
