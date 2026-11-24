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
$B preflight --study $S --phase calibration --confirm-overage-off   # billing route, sign-in, CLI digests, host, Docker
$B probe     --study $S                         # isolation probes, each vendor and role
$B controls  --study $S --phase calibration     # base and gold twice, known-bad, missing-report, every task
$B run       --study $S --phase calibration     # prints the plan; add --yes to start
$B lock      --study $S --phase calibration     # hashes every verdict, builds the blind adjudication queue
$B adjudicate --study $S --phase calibration --item ID --judgment supported --note "..."   # or --skip REASON
$B evaluate  --study $S --phase calibration     # hidden tests, only after lock and adjudication
$B score     --study $S --phase calibration
$B size      --study $S                         # power.py: phase-1 count, pilot or stop; frozen once
$B select    --study $S --phase main            # then the same steps for phase main
$B release   --study $S --confirm-redistribution   # privacy scan, digests, transcript asset, share.md
```

Every gate record (preflight, probes, controls) carries the digests of the study, the harness code and, for a phase, its manifest; `run` refuses a record made for anything else, and refuses outright if the harness code changed since `init`. `run` exits non-zero unless the phase is complete.

`run` stops cleanly at a usage limit and records a quota pause for that vendor, using the reset time the CLI states when it states one. Start it again after the limit resets; it resumes the same task block. A call whose retries are used up stops the run as incomplete; it is never recorded as done. It never runs on a timer.

## Spend

Only the CLIs' existing subscription sign-ins are used. `preflight` refuses to start if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY` or another billing key or API-key mode is in the environment, the CLI config or the sign-in store, and it checks each CLI's own status command against the isolated login store the calls will use. It also needs `--confirm-overage-off`: you check, in each vendor's account settings, that paid extra usage is off, because no CLI reports that. Billing keys are looked for again on every `run` start. Reports say $0 actual; any API-equivalent figure is disclosure only and is not money anyone pays. Token totals cover every launch (retries, probes, repeats) and are marked partial when any call reported no usage.

## Sign-in without exposure

Each call gets a fresh opaque directory under `/var/tmp/cr-bench-<uid>/` holding a single-commit export of the task's base tree, and a separate private directory with only that CLI's sign-in:

- Codex: an isolated `CODEX_HOME` holding a copy of `auth.json`.
- Claude Code: a subscription token from `claude setup-token`, kept in `~/.config/cr-bench/claude-oauth-token` (mode 600) and passed as `CLAUDE_CODE_OAUTH_TOKEN`.

Where those live on your machine goes in `agents.local.json` (ignored by git), which may set only the sign-in store, the CLI path, extra readable install directories, and transport values on the allowlist in `agents.json` (for Codex, only the ChatGPT backend URL). It cannot change model, effort, tools or sandbox.

## Confinement

Every agent call and every fixture grading run is wrapped in an outer OS sandbox, ported from Control Rod's daemon: Seatbelt (`sandbox-exec`) on macOS, bubblewrap (`bwrap`) on Linux. It denies reads of your home directory, the study directory, this repository and the whole workspace root, then allows back only the call's own directories and the CLI's install directories. Writes go only to the author's tree, or a checker's scratch directory, and the call's private directory; a checker's source tree is mounted read-only. The CLIs' own sandbox flags (frozen in `agents.json`) sit inside that. `preflight` fails for real agents on a host with neither mechanism.

Git never runs with your global or system config, hooks or signing. Each task's base tree is exported from git objects and checked by tree OID; an author's change is captured in a fresh trusted export, never by running git in the author's `.git`; patches stay bytes end to end and are re-applied and compared by tree OID.

`probe` checks this before any task call: fixed shell commands under the exact confinement of a real call must fail to read your HOME, the study, a sibling workspace, the other vendor's sign-in, the mirror cache, `~/.ssh` and the like, and must succeed on the call's own files. Then each agent is asked to try the same reads, and a probe counts only if the transcript shows the tool call.

Residual risk, disclosed in every report: a CLI's own tool shell can read that CLI's own sign-in, as it can under the product daemon. It can never read the other vendor's.

## Configs

- `configs/fixture.json`: eight offline fixture tasks and two stub agents. The tests run this.
- `configs/verified-historical.json`: SWE-bench Verified, the `15 min - 1 hour` and `1-4 hours` tiers, labelled historical. Its calendar horizon, call and token caps and timeouts are the owner's to set before `init`. The calibration allocation of 120 calls covers 12 tasks × 6 calls, stability repeats of up to 24, 4 probes and retry headroom.

Download the dataset once to a local JSONL file, pin its SHA-256, row count and split in the config (`init` refuses while they are null), and point `snapshot.path` at it. A pre-sampling exclusion list, if you use one, is pinned the same way under `selection.pre_exclusions`.

## Tests

```sh
python3 -m unittest bench/cross-check/test_bench.py
```

67 offline tests, run on Python 3.9 and 3.13, cover the rules the code enforces: the freeze, seeded selection and a reserve that must fill, signed sizing, exclusions closing at the first call, single-commit exports by tree OID, git hooks ignored, capture that never reads the author's `.git`, links and binary files in patches, read-only checker trees, the test-path rule (add, edit, delete, rename, `tests/`), the strict verdict schema, the isolation flags, the outer confinement (deny, allow back, read-only, no network; skipped on a host with neither mechanism), billing-key refusal, sealed, leaky and lazy probes, unique attempt IDs, the run lock, the call cap, the calibration allocation, the frozen phase-0 token gate, quota pauses in ledger order and the 24-hour grace, halts on sign-in and repeated infra errors, exhausted retries, the deadline, interrupted calls, model, CLI and harness changes, a checker that writes to source, grading by test ID, every-task controls, the staged verdict lock and its re-verification, the blind queue, scoring, sizing, and the release gate. They use no network and make no model calls.

## Limits

- The benchmark calls the CLIs directly, not through Control Rod's daemon.
- Two vendors, one model each. The result says nothing about other agents or about vendor diversity in general.
- Agent calls are not seeded. Every input and output is kept, so a run can be audited but not replayed exactly.
- Hidden tests are the reference, and they can be wrong. Tasks are audited and can be struck before any call.
- The agent half of the isolation probes depends on the agent trying each read; one that declines fails the probe rather than passing it. The harness half does not depend on the agent.
- `power.py` judges each simulated study with a cluster-robust normal interval, not the full task bootstrap that `score` uses. Its output records this.
