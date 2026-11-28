# Risk: Make every button and option work, or hide it until it does

- R-01: an older daemon refuses a job with an unknown field and stalls claims (DMN-4). The API sends `reasoning_effort` only when the claim says `supports_reasoning_effort`; a test covers a daemon without the flag.
- R-02: a level a CLI does not list reaches it and the run fails. The daemon maps only listed levels and adds nothing otherwise; a test covers each level for both CLIs.
- R-03: preparing on Add leaves a stray worktree when the capture is refused. The modal removes the worktree Add made on a 4xx refusal.
- R-04: a project saved with fresh-clone or branch now prepares a worktree. That is the only strategy that could ever bind, so such cards failed before and work now.
- R-05: SCRAM fires by accident. The switch opens a dialog; the stop needs its own press of Stop now, as on the Office page.
- R-06: a saved unbuilt check-in silently changes. It reads and saves as start-and-merge, the one built choice, which is what ran before.
- Trust surface: `spec/` gains one optional field and one optional flag, additive and not a major version. No `.github/`, `kernel/`, `policies/`, `tests/redteam/` or `docs/adr/` file is changed.

## Selected mode

- **Mode:** Standard
- Basis: user-facing controls and an additive wire field behind a capability flag; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each control in review batch 4 either does what it says or is gone. New Work and Quick add bind every card with a repository to its own worktree, preparing it on Add when needed. A capture from the capture box shows on the open project's Board. The chosen reasoning level reaches Claude Code as `--effort` and Codex as `model_reasoning_effort`, and only a daemon that says it reads the field gets it. Saved agents reach new cards. Setup offers only built check-in points and a button to make a project. SCRAM opens its confirm on the same screen. Compare is removed. Web, API and daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
