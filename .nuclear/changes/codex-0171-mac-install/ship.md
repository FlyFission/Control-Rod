# Ship: first macOS install fixes

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Not claimed:** no live Codex run on macOS; doctor's agent section checked on Linux only.

Rollback: revert the commit. The allowlist returns to refusing Codex 0.171.0.

Monitoring after merge: a Codex feature found to reach further than classified; a new Codex release refused for new features (each needs the same qualification).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
