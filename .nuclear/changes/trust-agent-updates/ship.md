# Ship: trust agent updates

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Accepted by owner decision:** newer Antigravity and Grok builds are seated without a live qualification (risk R-03, R-04).
- **Not claimed:** no live run of a newer Antigravity or Grok; Codex switch-off shown on the Linux build.

Rollback: revert the commit. Exact pins and the Codex refusal return.

Monitoring after merge: a newer build observed using a tool outside its sandbox (add it to the gate, or set a floor above the bad build); a Codex feature that will not switch off.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-03 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
