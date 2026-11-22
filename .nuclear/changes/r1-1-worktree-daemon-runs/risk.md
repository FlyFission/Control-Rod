# Risk: worktree daemon binding

**Mode:** Standard. **Execution owner:** Codex author agent. **Decision owner:** Ben Huffer.

| Risk | Control | Stop condition |
| --- | --- | --- |
| Capture text grants filesystem authority | Only validated structured capture input binds author runs. | Text header influences launch path. |
| Checkout escape or wrong branch | API and daemon independently validate containment, symlinks and Git identity. | Validation permits an escaped or changed checkout. |
| Run preparation deletes user files | Reserve per-run evidence paths; never clear the selected checkout. | Existing checkout data is overwritten during preparation. |
| Concurrent writers | Exclusive checkout custody. | Concurrent author launches share the checkout. |
| Checker sees author history | Checker never inherits the checkout binding. | Checker starts inside author checkout. |
| Old daemon ignores new binding | Claim admission requires checkout support. | Unsupported daemon claims a bound author run. |

Additive contracts require CODEOWNERS review at merge. No kernel decision function, policy, protected red-team test or workflow changes are planned. No new benchmark, budget or estimate is claimed.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Controls have author evidence and are independently checked before acceptance.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
