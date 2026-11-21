# Ship: lock down the README screenshot workflow

Release decision: **both revisions merged on the owner's recorded yes (see Signature); no release is authorized by this record.**

- **Merged:** the split workflow (#94) and the trusted push (#95). The owner's yes to each also covers keeping the screenshot workflow at all, which #93 added unsigned.
- **Not claimed:** that the PNG check proves a file is only an image; an independent review.
- **Decisions:** who signs (risk R-06) is settled by the sole-maintainer rule. Still open for the owner: whether the workflow should push to pull request branches at all, or keep the pictures as an artifact only.

## Signature

Signed under the sole-maintainer rule ([docs/collaboration.md](../../../docs/collaboration.md#sole-maintainer-sign-off), [ADR 0024](../../../docs/adr/0024-sole-maintainer-sign-off.md)). Ben Huffer is the only maintainer in CODEOWNERS and prompted this change, so these are his own recorded approvals, not an independent review. Both were given in the Claude chat before the rule existed; each question named the pull request and the trust surface it changes (the live workflows on `main`), and no trust-surface file changed after either yes.

| Field | Revision 1 | Revision 2 |
|---|---|---|
| Decision | Approve: merge #94 (squash-merged as 410eec8) | Approve: merge #95 (squash-merged as 1fe7cf8) |
| Question | "Should I merge PR 94? It changes the live workflow on main." | "Should I merge PR 95? It changes the live workflows on main." |
| Answer | "Yes" | "Yes" |
| Given | 2026-11-18 7:01 PM ET (2026-11-19 00:01 UTC), Claude chat | 2026-11-18 8:52 PM ET (2026-11-19 01:52 UTC), Claude chat |
| Recorded by | The implementing agent, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him. | Same |

## Rollback and monitoring

Rollback: revert the workflow commit. Monitoring: any `readme-shots` run started by `github-actions[bot]` that runs a job, or a bot commit touching anything outside `docs/assets/readme/app/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-05 are implemented with scanner, YAML-parse and local test evidence, and CI on this change is reported as it ran; the owner's recorded yes to each revision is in [ship](ship.md) under the sole-maintainer rule, with no independent review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
