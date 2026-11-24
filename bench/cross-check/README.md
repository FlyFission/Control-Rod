# Cross-vendor checking benchmark

Control Rod's core claim is that a second agent, from another vendor, should check an author's work before a person signs off. Published research supports parts of that idea (see `docs/research/second-checker/`), but no study we found measures one vendor's coding agent reviewing another vendor's code. This benchmark measures it on real tasks, and anyone can re-run it.

The design is [DESIGN.md](DESIGN.md) (v3.3), agreed after four rounds of blind review by Antigravity on Gemini 4 Neon and Codex on Astra. This README says how to run it. Where the two differ, DESIGN.md wins.

It is started by hand, every time. Nothing here runs on a schedule.

## What it measures

Two authors, Claude Code and Codex, each solve every task once. Every patch that is nonempty and valid is then checked twice: by a checker on the author's own model ("same") and by one from the other vendor ("cross"). Hidden tests (SWE-bench `FAIL_TO_PASS` and `PASS_TO_PASS`), which no agent sees, grade each patch as hidden-test-failing ("bad") or passing ("good").

The headline is the **equal-author-weight contrast**: cross minus same explicit-rejection rate, on bad patches (catches) and on good patches (false rejections), averaged over the two authors, with a 95% task-bootstrap interval. Beside it: both directions, paired 3×3 verdict tables, inconclusive bounds, exact McNemar within each author, Youden's J, leave-one-repository-out, verdict stability, and workflow outcomes for A1 (tests), A2 (+ same) and A3 (+ cross). The human arm (A4) is omitted from this run (DESIGN.md, Owner decision 3).

"Rejection" means an explicit fail verdict. The words "defects caught" are used only for the adjudicated outcome.

## The order of a study

Each step writes its record into the study directory and refuses to run out of order.

```sh
B="pnpm cr bench"            # or: python3 bench/cross-check/bench.py
S=~/cr-bench-studies/2026-11  # any directory; keep it outside the repository

$B init      --study $S --config bench/cross-check/configs/verified-historical.json  # freezes the protocol
$B select    --study $S --phase calibration     # 10-12 tasks and calibration/audit.md
$B exclude   --study $S --phase calibration --task ID --reason "..."   # strike defective tasks, before any call
$B preflight --study $S --phase calibration     # billing route, sign-in, CLI versions, host, Docker
$B probe     --study $S                         # isolation probes, each vendor and role
$B controls  --study $S --phase calibration     # base, gold, known-bad, missing-report controls
$B run       --study $S --phase calibration     # prints the plan; add --yes to start
$B lock      --study $S --phase calibration     # hashes every verdict, builds the blind adjudication queue
$B adjudicate --study $S --phase calibration --item ID --judgment supported --note "..."   # or --skip REASON
$B evaluate  --study $S --phase calibration     # hidden tests, only after lock and adjudication
$B score     --study $S --phase calibration
$B size      --study $S                         # power.py: phase-1 count, pilot or stop; frozen once
$B select    --study $S --phase main            # then the same steps for phase main
$B release   --study $S                         # privacy scan, digests, transcript asset, share.md
```

`run` stops cleanly at a usage limit and records a quota pause for that vendor. Start it again after the limit resets; it resumes the same task block. It never runs on a timer.

## Spend

Only the CLIs' existing subscription sign-ins are used. `preflight` refuses to start if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY` or another billing key is in the environment or in CLI config, and it checks each CLI's own status command against the isolated login store the calls will use. Reports say $0 actual; any API-equivalent figure is disclosure only and is not money anyone pays.

## Sign-in without exposure

Each call gets a fresh opaque directory under `/var/tmp/cr-bench-<uid>/` holding a single-commit export of the task's base tree, and a separate private directory with only that CLI's sign-in:

- Codex: an isolated `CODEX_HOME` holding a copy of `auth.json`.
- Claude Code: a subscription token from `claude setup-token`, kept in `~/.config/cr-bench/claude-oauth-token` (mode 600) and passed as `CLAUDE_CODE_OAUTH_TOKEN`.

Where those live on your machine goes in `agents.local.json` (ignored by git), which may set only the sign-in store, the CLI path and transport settings. It cannot change model, effort, tools or sandbox.

## Configs

- `configs/fixture.json`: eight offline fixture tasks and two stub agents. The tests run this.
- `configs/verified-historical.json`: SWE-bench Verified, the `15 min - 1 hour` and `1-4 hours` tiers, labelled historical. Its calendar horizon, call and token caps and timeouts are the owner's to set before `init`. The calibration allocation of 120 calls covers 12 tasks × 6 calls, stability repeats of up to 24, 4 probes and retry headroom.

Download the dataset once to a local JSONL file, pin its SHA-256 in the config, and point `snapshot.path` at it.

## Tests

```sh
python3 -m unittest bench/cross-check/test_bench.py
```

48 offline tests cover the rules the code enforces: the freeze, seeded selection and the reserve, exclusions closing at the first call, single-commit exports, read-only checker trees, the test-path rule (add, edit, delete, rename), patch digests, the strict verdict schema, the isolation flags, billing-key refusal, sealed and leaky probes, the call cap, the calibration allocation, the phase-1 token gate, quota pauses and the 24-hour grace, halts on sign-in and repeated infra errors, the deadline, interrupted calls, model and CLI changes, a checker that writes to source, grading by test ID, the controls, the blind queue, scoring, sizing, and the release privacy gate. They use no network and make no model calls.

## Limits

- The benchmark calls the CLIs directly, not through Control Rod's daemon.
- Two vendors, one model each. The result says nothing about other agents or about vendor diversity in general.
- Agent calls are not seeded. Every input and output is kept, so a run can be audited but not replayed exactly.
- Hidden tests are the reference, and they can be wrong. Tasks are audited and can be struck before any call.
- The isolation probes ask the agent to try each forbidden read. An agent that declines to try passes a negative probe; the flags and the opaque directory names are the primary controls.
- `power.py` judges each simulated study with a cluster-robust normal interval, not the full task bootstrap that `score` uses. Its output records this.
