# Basis: machine checks before the model check

**Change slug:** `machine-gate`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Status:** Proposed. Nothing is built yet. This record asks the owner whether to build it, and asks three questions below.

## Mission / need

Before a model looks at the work, Control Rod should check the facts a program can decide: do the plan's test commands exit 0, and did the author change only the files the plan said it would. A model checker is good at judgment and weak as a test runner. Asking it whether tests passed adds cost, delay and variance to a question that has one right answer. AGENTS.md rule 5 points the same way: values should come from tools with recorded inputs and outputs, not from a model's say-so.

## What already exists

- A plan has tasks with `depends_on` and checks with `criterion_ids`, `method`, `required` and `expected_result` (`spec/preparation.tsp:80`, `:87`). A plan with a dependency cycle is refused (`services/api/src/preparation/readiness.ts:312`).
- The checker agent runs checks itself. Its criterion results must cite a retained checker artifact as decisive evidence, not its own claim record (`services/api/src/preparation/results.ts:164`).
- Fails stick to the deliverable digest (change record `checker-attempts`). A failed pre-check sends the author back, up to three rounds (`services/api/src/work.ts:2928`).

## Gaps

1. **Control Rod runs nothing itself.** Whether a test command passed is whatever the checker agent's artifact says. No exit code is recorded by Control Rod.
2. **A plan never names files.** `PreparationTask` has no paths, so "the diff only touches planned files" cannot be checked.

## Proposal

1. Add an optional `paths: string[]` to `PreparationTask` (path prefixes the task may change).
2. Add an optional `command: string[]` to `PreparationCheck` (an argv, never a shell string) for checks a program can decide.
3. When an author round succeeds, Control Rod runs a **machine gate** before it queues the pre-check:
   - **Scope.** Every author output path must fall under some task's `paths`. If none of the tasks name paths, this step is skipped.
   - **Commands.** Each required check with a `command` runs once in the author's sandbox profile, with network off. Control Rod records the exit code and the digests of stdout and stderr as a retained artifact.
4. If the gate fails, the pre-check is not queued. The author gets the failure as a finding, the same way checker findings travel, and it counts as a round. If the gate passes, the model checker gets the gate results as inputs, so it can spend its effort on judgment.
5. The card shows the gate as its own line, so a person can see "tests passed, scope held" before reading what the checker said.

## Questions for the owner

1. Should a failed gate count against the three rounds? Recommended: yes. Otherwise a broken test can loop forever.
2. Should commands run only for packs that declare a runner (the software pack first)? Recommended: yes.
3. The refusal lives in the server, as in `checker-attempts`. Should it later move into the kernel, so a caller that skips the server cannot get past it? That would be a separate signed change.

## Out of scope

- `kernel/` decision functions, `policies/`, `tests/redteam/` and `.github/workflows/`. The refusal is server-side, so a kernel floor needs its own signed change.
- Running independent tasks in parallel from `depends_on`. That is a later, separate idea.
- Any spec major version. The fields are additive inside API 0.1.

## Source

This idea came from a public post on agent loops that the owner shared on 2026-11-23. It argued for writing the check first, as a condition a program can evaluate, and for code nodes in place of model steps where there is one right answer. Only the idea is used. No text or code is copied.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

A plan can name the paths a task may change and the commands that decide a check. The gate runs before any pre-check, records exit codes and output digests, and sends the author back on a failure without spending a model check. Plans without paths or commands behave as they do today. Existing tests, typecheck and the web suite pass. The owner keeps the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
