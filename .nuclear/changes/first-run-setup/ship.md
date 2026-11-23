# Ship: First-run setup and the Agents roster

Release decision: **draft pull request for owner review; no merge is authorized by this record.**

- Rollback: revert the merge. The `agent_setup` settings key can stay; nothing else reads it. No migration.
- Merge order: land #137 first (Codex 0.171.0 qualification). This PR touches `Shell.tsx` in two lines that #137 and #153 also edit nearby; expect a trivial rebase.
- After merge: on a fresh install, the app opens on Setup. Re-run intake on any card that failed with "Completion refused (invalid)".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
