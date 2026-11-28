# Plan: Make every button and option work, or hide it until it does

1. Spec: add `reasoning_effort` to Job and `supports_reasoning_effort` to the claim; run `pnpm spec`.
2. Daemon: read the field, declare the flag, map to each CLI's flag, record `--effort` as a valued flag in attestation; tests in `effort_test.go`.
3. API: resolve the level from the card tag or project preference; send it only to a daemon that declares the flag; plain refusal for non-worktree binds; test in `runs.test.ts`.
4. Web: hide the strategy select; prepare on Add; tag capture-box captures; record chosen agents; Quick add prepares for any repository; Setup button and built check-ins; SCRAM dialog in place; New Work context; remove Compare. Tests beside each.
5. Web, API and daemon tests; spec drift check; repo gates; change record. The merge is the owner's decision.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each control in review batch 4 either does what it says or is gone. New Work and Quick add bind every card with a repository to its own worktree, preparing it on Add when needed. A capture from the capture box shows on the open project's Board. The chosen reasoning level reaches Claude Code as `--effort` and Codex as `model_reasoning_effort`, and only a daemon that says it reads the field gets it. Saved agents reach new cards. Setup offers only built check-in points and a button to make a project. SCRAM opens its confirm on the same screen. Compare is removed. Web, API and daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
