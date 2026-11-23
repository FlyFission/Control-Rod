# Cross-vendor checking benchmark

Control Rod's core claim is that a second agent, from another vendor, should check an author's work before a person signs off. Published research supports the pieces of that idea (see `docs/research/second-checker/`, PR #152), but no study we found measures one vendor's coding agent reviewing another vendor's code. This benchmark measures it on real tasks, and anyone can re-run it.

It is started by hand, every time. Nothing here runs on a schedule.

## What it measures

Each task is a real GitHub issue with hidden tests (SWE-bench Verified). Each of the two authors (Claude Code and Codex, the two agents that run work in Control Rod today) solves each task once. Every patch is then checked twice: by a checker running the author's own model, and by a checker from the other vendor. The same patches go through four workflows:

| Workflow | Accepts a patch when |
|---|---|
| A1 Author + tests | the task's existing tests still pass |
| A2 + same-model checker | A1, and a checker on the author's own model says pass |
| A3 + cross-vendor checker | A1, and a checker from the other vendor says pass |
| A4 + cross-vendor checker + human | A3, and a person accepts it in `review` |

Ground truth is the task's hidden tests (SWE-bench `FAIL_TO_PASS` and `PASS_TO_PASS`), which neither the author nor the checker sees.

For each workflow, `score` reports, with 95% Wilson intervals:

- **Accepted:** patches the workflow lets through.
- **Defects caught:** unresolved patches the workflow rejected.
- **Good patches rejected:** resolved patches the workflow rejected (the checker's false positives).
- **Accepted but unresolved:** defects that reached the end anyway.
- **Agent minutes, human minutes, tokens, and CLI-reported USD.** Claude Code reports an API-equivalent cost; Codex reports tokens only.

It also compares the two checkers on the same patches: of the patches the tests let through that the hidden tests fail, how many did only the cross-vendor checker catch, and how many only the same-model one (exact McNemar test on those two counts).

## Why it is built this way

- **One author patch, judged four ways.** The arms differ only in the gate, so a difference between A2 and A3 comes from the checker, not from a different author run. It also keeps cost down: one task costs 2 author calls and 4 checker calls.
- **The checker sees the issue and the diff, nothing else.** No transcript, no reasoning, no author name. That matches Control Rod's checker contract and the self-preference results (Panickssery et al. 2024).
- **Tests are a gate, not the verdict.** METR (2026) found maintainers would not merge roughly half of 296 test-passing AI patches, so A4 adds a person, timed.
- **Tasks are read before the run.** OpenAI's 2026 audit of 138 often-failed SWE-bench Verified tasks found material problems in 59.4% of them. `select` writes `tasks.md` so a person can strike a task whose tests ask for something its issue does not, in `excluded.json` with the reason, before any paid call. Striking a task after seeing results is not allowed.
- **Inconclusive is not pass.** A checker answer without a verdict block counts as not passing and is counted separately.

## Running it

```sh
pnpm cr bench select --config bench/cross-check/configs/fixture.json   # offline dry run, stub agents
pnpm cr bench run --run bench/cross-check/runs/<id>
pnpm cr bench evaluate --run bench/cross-check/runs/<id>
pnpm cr bench review --run bench/cross-check/runs/<id>
pnpm cr bench score --run bench/cross-check/runs/<id>
```

A real run uses `configs/pilot.json` (5 tasks, 30 agent calls) or `configs/v1.json` (20 tasks, 120 calls). It needs the `claude` and `codex` CLIs signed in, Docker, and `uv` for the SWE-bench harness. `run` prints the number of calls and stops; it starts paid calls only with `--yes`. The budget in the config caps calls and CLI-reported cost, and a re-run resumes where it stopped.

Per-machine CLI flags (for example a non-default Codex endpoint) go in `agents.local.json`, which is not committed. The model each agent uses is in `agents.json` and is written into the run record.

`python3 -m unittest bench/cross-check/test_bench.py` runs the fixture end to end with no network and no paid calls.

## What a run leaves behind

`runs/<id>/` holds `run.json` (config and its digest, dataset revision and row digest, seed, Control Rod commit, CLI versions, harness version), `tasks.json` and `tasks.md`, every prompt, patch, transcript and verdict under `calls/`, `evaluation.json`, `reviews.json`, and the scored `results.json`, `report.md` and `share.md`. `share.md` is plain post text that always carries its sample size, intervals and limits.

## Limits

- Agent calls are not seeded. The task sample is seeded; each call's output is kept, so a run can be audited but not replayed exactly.
- Two vendors. The result says nothing about other agents.
- Small samples. A pilot of 5 tasks is a check that the pipeline works, not a result.
- Authors work in a plain checkout, not the task's test environment. The Codex author can run commands in its own sandbox; the Claude author has no shell. That affects how good the patches are, not how the two checkers compare on them.
- The hidden tests are the ground truth, and they can be wrong.
