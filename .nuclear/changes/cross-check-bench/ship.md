# Ship: cross-vendor checking benchmark

Release decision: **pull request for owner review. This record does not authorize a merge or a paid run.**

- **Proposed:** merge `bench/cross-check/` and the `pnpm cr bench` subcommand. Then, with the owner's go-ahead and budget, a 5-task pilot on the owner's machine to prove the pipeline, before a 20-task run.
- **Not claimed:** any result about cross-vendor checking. The fixture numbers in `evidence/` come from stub agents and say nothing about real ones.
- **Not claimed:** the fetch from Hugging Face and the SWE-bench harness step have not run. They are written against the documented interfaces and untested here.
- **Owner decisions requested:** the models in `agents.json` (Claude: `claude-sonnet-5-5`; Codex: `gpt-6.2-sol`), the budget caps in `configs/pilot.json` and `configs/v1.json` (placeholders), and the go-ahead for the pilot.

Rollback: revert the commit. Nothing else reads `bench/`. Run directories are self-contained.

Monitoring after merge: the share text of each published run is read against its `results.json` before posting.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` runs the four workflows on the same author patches, started by hand only, and refuses paid agent calls without `--yes` and past the configured budget. A run records its seed, task source digest, models, CLI versions and every prompt, patch and verdict. The score reports each workflow with its sample size and 95% intervals, and the share text always carries its limits. The fixture dry run passes with no network. The owner approves any paid run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
