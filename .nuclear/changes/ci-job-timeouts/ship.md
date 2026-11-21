# Ship: bounded timeouts for every CI job

Release decision: **approved for merge by the sole maintainer's recorded yes (see Signature).**

- **Proposed:** merge the workflow commit and this record to `main`.
- **Not claimed:** that the caps are the right values (they are policy choices); that the checker catches every malformed workflow (it covers `.github/workflows/*.yml` by a line scan, backed here by a real parse of the one file); a signature from a maintainer other than the person who prompted the agent.
- **Decisions, as settled on 2026-11-21:**
  1. Who signs. `main` now has [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off) (#97), so the sole maintainer's recorded yes is the signature. Settled by the owner's words below.
  2. Cap values: accepted as proposed, `typescript` 20, `rust` 30, `go` 15, `python` 15, `licenses` 15, `change-records` 10, `sbom` 10 minutes, with a 60-minute ceiling in the checker. This is the agent's own choice, made under the owner's delegation below; the owner did not name values.
  3. The new `change-records` step stays. Agent's own choice, under the same delegation.
  4. DCO: no `Signed-off-by` line is added. It is a human certification, and the agent does not type it.

## Signature

Recorded under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

| Field | Entry |
|---|---|
| Decision | Approve: pull request #92 as it stood at `5152d9c`, with the caps and the new step as proposed |
| Trust-surface files | `.github/workflows/ci.yml` |
| Question | A message in the owner's Claude project thread "Close out the open review decisions", posted 2026-11-21 about 12:50 UTC (7:50 AM EST). It named #92 as the CI job timeouts pull request, said the sole-maintainer rule now applies to every trust-surface item in it, and asked the owner to sign under it, accept the caps, keep the new step and choose how to handle DCO |
| Answer | "You have my permission to close all of these out in the objectively best way possible continue", Ben Huffer, project owner and sole maintainer, in the same thread, 2026-11-21 13:24 UTC (8:24 AM EST, America/New_York) |
| Head when asked | `5152d9c`. After the yes, `main` was merged in (no conflict; the merge does not change `ci.yml`) and this `ship.md` was filled in; no other file in this change was touched |
| Recorded by | An agent working for the owner in that thread, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

## Rollback and monitoring

Rollback: revert the workflow commit; the record can stay. No schema, migration, generated file or wire change is involved.

Monitoring after merge: a job that ends with "The job running on runner ... has exceeded the maximum execution time" is a cap hit. Re-run once, and raise that job's cap if it was a healthy run. Compare job times with `evidence/job-times.txt` after the next dependency bump or large test addition.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. The signature is recorded above under sole-maintainer sign-off.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
