# Trace: cross-vendor checking benchmark

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| XB-01 Four workflows judge the same author patch. | `bench.py` `plan_calls`, `score` | `test_bench.py` FixtureRun.test_end_to_end | implemented and tested |
| XB-02 The checker sees the issue and the diff only. | `prompts/checker.md`, `cmd_run` checker branch | same test, checker prompt assertions | implemented and tested |
| XB-03 Started by hand; paid calls need `--yes` and stop at the budget. | `cmd_run`, `scripts/cr.mjs` `bench` | `test_paid_run_needs_yes` | implemented and tested |
| XB-04 Seeded, reproducible task sample; struck tasks never selected. | `select_tasks`, `excluded.json` | Selection tests | implemented and tested |
| XB-05 Every rate has its n and a 95% Wilson interval; paired checker comparison. | `wilson`, `mcnemar_exact`, `rate` | Stats tests | implemented and tested |
| XB-06 Share text carries its limits and marks a dry run as not a result. | `share` | end-to-end test | implemented and tested |
| XB-07 Real tasks evaluated by the SWE-bench harness. | `fetch_hf`, `eval_swebench` | not executed: this host's network policy blocks Hugging Face, and no paid run was approved | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` runs the four workflows on the same author patches, started by hand only, and refuses paid agent calls without `--yes` and past the configured budget. A run records its seed, task source digest, models, CLI versions and every prompt, patch and verdict. The score reports each workflow with its sample size and 95% intervals, and the share text always carries its limits. The fixture dry run passes with no network. The owner approves any paid run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
