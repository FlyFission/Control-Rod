# Plan: bounded timeouts for every CI job

1. Collect per-job wall time for six recent successful runs of `ci.yml` on `main` into `evidence/job-times.input.csv`; compute the table with `evidence/job-times.py` and record digests in `evidence/digests.txt`.
2. Choose the caps as a proposal for the signer: `typescript` 20, `rust` 30, `go` 15, `python` 15, `licenses` 15, `change-records` 10, `sbom` 10 minutes. These are the values drafted in PR #69's proposal; they are policy, not derived.
3. Edit `.github/workflows/ci.yml` in its own commit: one `timeout-minutes` line after each `runs-on`, and one step in `change-records` running `python3 tools/check_workflow_timeouts.py`. Nothing else.
4. Check the edit three ways and keep the outputs: the checker (7 findings before, 0 after), a real YAML parse, and the shape of the diff.
5. Open a draft PR with the trust-surface box ticked and leave the signature to a maintainer who did not author the change.

## Rollback

Revert the workflow commit. The record and evidence stay. To drop only the new step, delete the last step of `change-records`.

## Exit criteria

Steps 1 to 5 are done, CI is green on the PR head, and the signature, the cap values and the signer's independence are left for the maintainers.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
