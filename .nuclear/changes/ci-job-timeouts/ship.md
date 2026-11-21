# Ship: bounded timeouts for every CI job

Release decision: **signed by the sole maintainer's recorded yes (see Signature); merge waits for the owner to state the cap values in their own words.**

- **Proposed:** merge the workflow commit and this record to `main`.
- **Not claimed:** that the caps are the right values (they are policy choices); that the checker catches every malformed workflow (it covers `.github/workflows/*.yml` by a line scan, backed here by a real parse of the one file); a signature from a maintainer other than the person who prompted the agent.
- **Decisions, as settled on 2026-11-21:**
  1. Who signs. `main` now has [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off) (#97), so the sole maintainer's recorded yes is the signature. Settled by the owner's words below.
  2. Cap values: **open, for the owner.** The proposal is `typescript` 20, `rust` 30, `go` 15, `python` 15, `licenses` 15, `change-records` 10, `sbom` 10 minutes, with a 60-minute ceiling in the checker. AGENTS.md rule 5 says no engineering number is typed by a model, and the owner's delegation below does not name values, so the agent does not choose them. They are policy inputs to `evidence/job-times.py`, not outputs of it.
  3. The new `change-records` step stays. Agent's own choice, under the same delegation.
  4. DCO: no `Signed-off-by` line is added. It is a human certification, and the agent does not type it.

## Signature

Recorded under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

| Field | Entry |
|---|---|
| Decision | Approve: pull request #92 as it stood at `5152d9c`, with the new step. The cap values are recorded separately once the owner states them |
| Trust-surface files | `.github/workflows/ci.yml` |
| Question | The message quoted word for word below, posted in the owner's Claude project thread "Close out the open review decisions" on 2026-11-21 at about 12:50 UTC (7:50 AM EST). Its opening and its #92 section are quoted; its #88 and #102 sections are left out |
| Answer | "You have my permission to close all of these out in the objectively best way possible continue", Ben Huffer, project owner and sole maintainer, in the same thread, 2026-11-21 13:24 UTC (8:24 AM EST, America/New_York) |
| Head when asked | `5152d9c`. After the yes, `main` was merged in (no conflict; the merge does not change `ci.yml`) and this record (`ship.md`, `risk.md`, `verification.md`) was updated. No trust-surface file changed |
| Recorded by | An agent working for the owner in that thread, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

The question, word for word:

> Ben, all three PRs come down to 10 decisions. I'd say yes to most of them. One thing changes the picture: the sole-maintainer rule from #97 is now on `main`, so your own recorded yes counts as the signature on every trust-surface item below. I haven't merged, approved or pushed anything.
>
> **#92 CI job timeouts** ([PR](https://github.com/FlyFission/Control-Rod/pull/92))
> 5. **Signer.** The PR says you can't sign, but that was written before #97 landed. Recommend you sign under sole-maintainer sign-off, then have the agent fill the `ship.md` Signature table.
> 6. **Cap values** (10 to 30 min, at least 7.8x the slowest of 7 runs). Recommend accepting them. The tightest is typescript at 20 min against 154 s, which still leaves plenty of room.
> 7. **The new checker step.** Recommend keeping it, so a job added later without a timeout fails CI.
> 8. **DCO sign-off.** Recommend squash-merging with your sign-off rather than rebasing.

## Rollback and monitoring

Rollback: revert the workflow commit; the record can stay. No schema, migration, generated file or wire change is involved.

Monitoring after merge: a job that ends with "The job running on runner ... has exceeded the maximum execution time" is a cap hit. Re-run once, and raise that job's cap if it was a healthy run. Compare job times with `evidence/job-times.txt` after the next dependency bump or large test addition.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CT-01 to CT-04 are implemented with checker and YAML-parse evidence and a green CI run on this change; the signature, the cap values and the independence of the signer are stated for the maintainer. The signature is recorded above under sole-maintainer sign-off.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
