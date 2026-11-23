# Basis: cross-vendor checking benchmark

**Change slug:** `cross-check-bench`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether Control Rod may carry its own benchmark of author, same-model checker, cross-vendor checker and human sign-off, run by hand on real tasks.

## Mission / need

The README's research section (PR #152) ties Control Rod's independent check to published results, and says plainly that no study measures one vendor's coding agent reviewing another vendor's code. The owner asked (2026-11-23, project thread) to send major updates through a repeatable run and get output he can share honestly ("open source, free, try it today"). This change builds that run. It makes no claim about the result: no paid run has happened.

## Scope

In scope: `bench/cross-check/` (the script, configs, prompts, fixture tasks, tests, README), a `bench` subcommand in `scripts/cr.mjs` that calls it, and this packet.

Out of scope: `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, the daemon and the control plane. The benchmark calls the agent CLIs directly; it does not go through Control Rod's dispatch, so it measures the checking pattern, not this build's kernel.

## Fixed inputs

- Task source: SWE-bench Verified (`princeton-nlp/SWE-bench_Verified`), fetched at run time; the dataset revision and a digest of the rows are written into `run.json`. Not vendored.
- Evaluation: the SWE-bench harness (MIT), run in Docker through `uv`; its version is recorded per run.
- Agents: `claude` and `codex` CLIs, the two that run work in Control Rod today. Models in `bench/cross-check/agents.json`.
- Research context and limits: `docs/research/second-checker/` on PR #152.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Hidden tests are a usable ground truth for "resolved". | SWE-bench design; OpenAI's 2026 audit says some are wrong, so tasks are read and can be struck before a run. | A task struck after its results were seen, or a report that treats resolved as mergeable. |
| One author patch judged by four gates isolates the checker's effect. | All arms read the same patch; only the gate differs. | Arms built from different author runs. |
| The checker sees the issue and the diff only. | Prompt template and a test that the checker prompt holds no author transcript. | A checker prompt containing author output or the author's name. |
| CLI-reported cost and tokens are enough to bound spend. | Claude Code reports an API-equivalent cost; Codex reports tokens. | A run that exceeds its call cap. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` runs the four workflows on the same author patches, started by hand only, and refuses paid agent calls without `--yes` and past the configured budget. A run records its seed, task source digest, models, CLI versions and every prompt, patch and verdict. The score reports each workflow with its sample size and 95% intervals, and the share text always carries its limits. The fixture dry run passes with no network. The owner approves any paid run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
