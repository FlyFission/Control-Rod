# Basis: bounded timeouts for every CI job

**Change slug:** `ci-job-timeouts`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-18
**Decision this basis supports:** whether the CI workflow may be edited to bound every job and to run the timeout checker on each change.

## Mission / need

None of the seven jobs in `.github/workflows/ci.yml` sets `timeout-minutes` (checked 2026-11-18 on `main` at 44765a0), so each can run for GitHub's default of 360 minutes. A stuck step would hold a runner for hours and leave a required check without a verdict. `tools/check_workflow_timeouts.py` and the pattern note `docs/patterns/xerj.md` (PR #69) deferred the workflow edit to a signed record; this is that record.

## Protected outcomes

| Protected outcome | Evidence needed |
|---|---|
| A hung job ends within minutes. | Every job carries an integer `timeout-minutes`; `evidence/yaml-parse.txt`, `evidence/checker-before-after.txt`. |
| A later job added without a timeout fails CI. | The new `change-records` step, red on the original file (7 findings) and green on the edited one. |
| A healthy run is not cancelled by a cap. | `evidence/job-times.txt`: worst of 7 runs against each cap. |
| Nothing else in the workflow changes. | `evidence/diff-shape.txt`: 9 lines added, 0 removed; no action pin, permission, trigger or env value touched. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Seven recent successful runs represent normal job time. | `evidence/job-times.input.csv`: six on `main` (runs 43739430989 to 44231902244, 2026-11-15 to 2026-11-18), one of them a 14-package dependency bump, plus this PR's own run 44319665384. | A job approaching half its cap; a new heavy test suite or build. |
| `timeout-minutes` bounds job execution only. No job here uses `environment:` or a required reviewer, so no approval wait is involved. | `ci.yml` has no `environment:` key (read 2026-11-18). | Any job given an `environment`. |
| `python3` is on the runner's path for the new step. | The existing step runs `python -I .ng/tools/ng.py`; this PR's own CI exercises the new step before merge. | The step red on interpreter lookup. |
| The timing inputs are accurate. | Transcribed by the agent from the GitHub Actions jobs API output (no `gh` access in this session); job IDs are in the CSV so each row can be re-read. | Any row that disagrees with the run page. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
