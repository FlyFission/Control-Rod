# Plan: cross-vendor checking benchmark

1. `bench/cross-check/bench.py`: `select` (seeded sample, `tasks.md` for reading before the run), `run` (author, then same-model and cross-vendor checker per patch, budget, `--yes`), `evaluate` (SWE-bench harness, or fixture tests), `review` (blind, timed human accept for A4), `score` (results, report, share text).
2. Configs: `fixture` (offline, stub agents), `pilot` (5 tasks, 30 calls), `v1` (20 tasks, 120 calls). Budgets in the configs are the owner's to set before a paid run.
3. Fixture tasks covering every cell: resolved and accepted, unresolved and caught, resolved and rejected, unresolved and accepted, and a case the two checkers disagree on.
4. `pnpm cr bench` subcommand. Tests. Draft pull request.
5. Before any paid run: the owner reads the plan, sets the budget, and says go. The pilot runs on the owner's machine (signed-in CLIs, Docker).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` runs the four workflows on the same author patches, started by hand only, and refuses paid agent calls without `--yes` and past the configured budget. A run records its seed, task source digest, models, CLI versions and every prompt, patch and verdict. The score reports each workflow with its sample size and 95% intervals, and the share text always carries its limits. The fixture dry run passes with no network. The owner approves any paid run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
