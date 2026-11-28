# Ship: Make every button and option work, or hide it until it does

Release decision: **pending**. The merge is the owner's decision.

- Rollback: revert the merge. No data or migration. A daemon built from this change still works with an older API, since the field is optional, and an older daemon still works with this API, since it never sends the flag.
- Monitoring after merge: on the owner's Mac, a card made with a reasoning level shows `--effort <level>` in its Claude Code command, or `model_reasoning_effort` in its Codex command. A card added from New Work with a repository has its own worktree without pressing Prepare. A capture from the capture box shows on the open project's Board. The SCRAM switch opens the stop dialog without leaving the page.
- Limits: tests use fake runtimes and a local PostgreSQL, not real Claude Code or Codex runs. Fresh clone and branch checkouts stay unbound until the follow-up. Compare is gone until it can line deliverables up. One daemon test (`TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`) fails in this cloud container both before and after this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each control in review batch 4 either does what it says or is gone. New Work and Quick add bind every card with a repository to its own worktree, preparing it on Add when needed. A capture from the capture box shows on the open project's Board. The chosen reasoning level reaches Claude Code as `--effort` and Codex as `model_reasoning_effort`, and only a daemon that says it reads the field gets it. Saved agents reach new cards. Setup offers only built check-in points and a button to make a project. SCRAM opens its confirm on the same screen. Compare is removed. Web, API and daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
