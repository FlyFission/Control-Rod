# Trace: cross-vendor checking benchmark

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| XB-01 Frozen protocol; selection seeded, quota-bound, never re-drawn; exclusions close at the first call (§2, §3). | `manifest.py` | Protocol tests | implemented and tested |
| XB-02 Opaque single-commit workspaces outside the repo and HOME; read-only checker trees (§4, §5). | `workspace.py`, `run.py` | Workspaces tests, checker-vandal test | implemented and tested |
| XB-03 Isolation flags, isolated sign-in, billing-key refusal, probes with positive and negative controls (§4, §9). | `agents.py`, `preflight.py` | AgentArgs, Preflight tests | implemented and tested offline; real CLIs open |
| XB-04 Failure taxonomy, call cap, phase-1 token gate, quota pauses, halts, deadline, resume checks (§5, §9). | `agents.py`, `ledger.py`, `run.py` | LedgerRules, EndToEnd tests | implemented and tested |
| XB-05 Patch capture, test-path rule, digests; grading by test ID; controls (§6). | `patches.py`, `grading.py` | Workspaces, Grading tests | fixture grader tested; SWE-bench grader open |
| XB-06 Lock, blind queue before evaluation, judgments (§7, Owner decision 2). | `adjudicate.py` | EndToEnd calibration test | implemented and tested |
| XB-07 Metrics and inference as frozen (§7). | `score.py`, `stats.py` | Stats, EndToEnd tests | implemented and tested |
| XB-08 Sizing, pilot or stop (§2, Owner decision 1). | `power.py` | sizing test | implemented and tested on fixtures |
| XB-09 Release gate and share text with disclosures (§10). | `release.py` | release tests | implemented and tested |
| XB-10 Started by hand only. | `scripts/cr.mjs`, `bench.py` | `run` without `--yes` makes no call (EndToEnd) | implemented and tested |


## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` implements DESIGN.md v3.3: a frozen protocol, calibration then sizing then phase 1, isolated single-commit workspaces with isolated sign-in, matched capabilities, the failure taxonomy, grading by test ID with controls, a blind adjudication queue built before evaluation, the frozen statistics, and a release gate. Every step is started by hand and refuses to run out of order. Subscription billing is verified before any call; no API key is used. The offline tests pass with no network and no model calls. Nothing runs on the owner's Mac until the owner says go for calibration.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
