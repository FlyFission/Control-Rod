# Risk: cross-vendor checking benchmark

- **Mode:** Standard
- Execution owner: Claude (project thread "Benchmark cross-vendor checking on real tasks").
- Decision owner: Ben Huffer. No trust surface is edited (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, kernel decision functions).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Paid agent calls start without the owner's go-ahead, or run past a budget. | `run` prints the call count and stops unless `--yes`; `max_calls` and `max_reported_usd` stop the loop; a re-run resumes. | A paid call made without `--yes` (test: "paid run needs yes"). |
| R-02 | A result is shared without its context, or cherry-picked. | `share.md` is generated from `results.json` and always prints n, intervals and limits; excluded tasks must be struck before the run, with a reason. | A post figure with no sample size or interval, or a task struck after results. |
| R-03 | The checker sees the author's reasoning, so the check is not independent. | Checker prompt is the issue and the diff; the checker works in a fresh checkout with the patch applied. | A checker prompt containing author output (test). |
| R-04 | An agent run on an untrusted repository damages the owner's machine. | Throwaway checkouts under the run directory; Claude author has no shell, Claude checker is read-only (plan mode); Codex author uses its `workspace-write` sandbox and the checker `read-only`. Tasks are well-known open-source repositories. | An agent writing outside its checkout. |
| R-05 | The benchmark is read as a scheduled job, against the owner's no-schedules rule. | No cron, timer or workflow; every step is a manual command. | Any schedule added for it. |
| R-06 | Personal setup leaks into the public repository. | Per-machine CLI flags live in `agents.local.json`, which is ignored by git. | A committed endpoint, account or path from the owner's machine. |

## Selected mode

- **Mode:** Standard
- Basis: a self-contained script and a CLI subcommand; no protected surface; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` runs the four workflows on the same author patches, started by hand only, and refuses paid agent calls without `--yes` and past the configured budget. A run records its seed, task source digest, models, CLI versions and every prompt, patch and verdict. The score reports each workflow with its sample size and 95% intervals, and the share text always carries its limits. The fixture dry run passes with no network. The owner approves any paid run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
