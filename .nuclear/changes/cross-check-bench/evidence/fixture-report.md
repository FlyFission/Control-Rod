# Cross-vendor checking: fixture-dryrun

## Context

- Run `fixture-dryrun`, Control Rod `48742b9daec7`, scored 2026-11-23T19:49:36Z.
- Tasks: 4 from fixture (revision `n/a`), seed 20261123. Each task is solved once by each author.
- Agents: stub-a: stub via stub, stub-b: stub via stub.
- Ground truth is the task's hidden tests. Passing them does not mean a maintainer would merge the patch.
- Agent calls are not seeded; a re-run can differ. One run is one sample.

## Results by workflow

| Workflow | Accepted | Defects caught (of unresolved) | Good patches rejected | Accepted but unresolved | Agent min | Human min | Tokens | Reported USD |
|---|---|---|---|---|---|---|---|---|
| A1 Author + tests | 8/8 (100%, 95% CI 68%–100%) | 0/4 (0%, 95% CI 0%–49%) | 0/4 (0%, 95% CI 0%–49%) | 4/8 (50%, 95% CI 22%–78%) | 0.0 | 0 | 0 | n/a |
| A2 + same-model checker | 3/8 (38%, 95% CI 14%–69%) | 3/4 (75%, 95% CI 30%–95%) | 2/4 (50%, 95% CI 15%–85%) | 1/3 (33%, 95% CI 6%–79%) | 0.0 | 0 | 0 | n/a |
| A3 + cross-vendor checker | 3/8 (38%, 95% CI 14%–69%) | 3/4 (75%, 95% CI 30%–95%) | 2/4 (50%, 95% CI 15%–85%) | 1/3 (33%, 95% CI 6%–79%) | 0.0 | 0 | 0 | n/a |
| A4 + cross-vendor checker + human | 2/8 (25%, 95% CI 7%–59%) | 3/4 (75%, 95% CI 30%–95%) | 3/4 (75%, 95% CI 30%–95%) | 1/2 (50%, 95% CI 9%–91%) | 0.0 | 0.0 | 0 | n/a |

## Same-model versus cross-vendor, on the same patches

Patches the existing tests let through that the hidden tests fail: 4. Caught only by the cross-vendor checker: 1. Caught only by the same-model checker: 1. Exact McNemar p = 1.0.

Inconclusive checker answers (counted as not passing): 0.
A4 patches still waiting for human review: 0.

## Limits

- Small samples give wide intervals. Read the intervals, not the point values.
- Two vendors only (the two that run work in Control Rod today). Results say nothing about others.
- Hidden tests can be wrong; tasks a person struck before the run are listed in excluded.json.
- Authors work without the task's test environment; the Codex author can run commands in its own sandbox, the Claude author has no shell. That affects authors, not the checker comparison.
- Reported USD is only what a CLI reports. Subscription use is shown as tokens.
