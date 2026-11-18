# Ship: lock down the README screenshot workflow

Release decision: **draft pull request for a maintainer's signature; no merge or release is authorized by this record.**

- **Proposed:** merge the split workflow and this record to `main` once a maintainer who did not author the change has reviewed and signed. The signature also covers keeping the screenshot workflow at all, which #93 added unsigned.
- **Not claimed:** that the PNG check proves a file is only an image; an independent signature.
- **Decisions requested from the maintainers:**
  1. Who signs (see risk R-06).
  2. Whether the workflow should push to pull request branches at all, or keep the pictures as an artifact only (delete the `commit` job).

## Signature

| Field | Entry |
|---|---|
| Decision | not yet signed: approve, approve with changes, or reject |
| Signed by | not yet signed: a maintainer other than the person who prompted the agent |
| Date | not yet signed |
| Basis | not yet signed: the PR review that approves `readme-shots.yml` as it stands |

Until the Signature table is filled by that maintainer, this change is an unsigned proposal.

## Rollback and monitoring

Rollback: revert the workflow commit. Monitoring: any `readme-shots` run started by `github-actions[bot]` that runs a job, or a bot commit touching anything outside `docs/assets/readme/app/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the signature for the screenshot workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
