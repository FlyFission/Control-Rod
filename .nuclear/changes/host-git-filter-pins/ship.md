# Ship: replace repository-defined filter drivers in host-side git

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Not claimed:** upstream's deny-by-default repository config policy is not ported (risk R-04). It should be ported, or the runtime mounts shown to keep agents from writing repository config, before `HostGitCommand` gains a caller in a repository an agent can write.
- **Not run:** Windows; the tests ran on Linux with git 2.43.0.

Rollback: revert the commit. Daemon only; no callers.

Monitoring after merge: none needed until a caller is added.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-04 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
