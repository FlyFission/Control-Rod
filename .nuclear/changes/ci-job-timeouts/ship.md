# Ship: bounded timeouts for every CI job

Release decision: **draft pull request for a maintainer's signature; no merge or release is authorized by this record.**

- **Proposed:** merge the workflow commit and this record to `main` once a maintainer who did not author the change has reviewed and signed.
- **Not claimed:** that the caps are the right values (they are policy choices); that the checker catches every malformed workflow (it covers `.github/workflows/*.yml` by a line scan, backed here by a real parse of the one file); an independent signature.
- **Decisions requested from the maintainers:**
  1. Who signs. `docs/collaboration.md` counts the person who prompted the agent as the author, so that person cannot be the independent signer. CODEOWNERS lists only `@FlyFission` and the PR is opened from that account, so GitHub cannot show an approval from a different person unless a second maintainer is added or the owner records an exception. The agent does not choose.
  2. Whether the cap values suit the team: `typescript` 20, `rust` 30, `go` 15, `python` 15, `licenses` 15, `change-records` 10, `sbom` 10 minutes, with a 60-minute ceiling in the checker.
  3. Whether the new `change-records` step stays, or the caps ship alone.

## Signature

| Field | Entry |
|---|---|
| Decision | not yet signed: approve, approve with changes, or reject |
| Signed by | not yet signed: a maintainer other than the person who prompted the agent |
| Date | not yet signed |
| Basis | not yet signed: the PR review that approves commit `ci.yml` as it stands |
| Caps accepted or changed | not yet signed |

Until the Signature table is filled by that maintainer, this change is an unsigned proposal.

## Rollback and monitoring

Rollback: revert the workflow commit; the record can stay. No schema, migration, generated file or wire change is involved.

Monitoring after merge: a job that ends with "The job running on runner ... has exceeded the maximum execution time" is a cap hit. Re-run once, and raise that job's cap if it was a healthy run. Compare job times with `evidence/job-times.txt` after the next dependency bump or large test addition.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
