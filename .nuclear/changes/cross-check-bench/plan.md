# Plan: cross-vendor checking benchmark

1. Rebuild `bench/cross-check/` as the `crbench` package to DESIGN.md v3.3: protocol freeze and selection (`manifest.py`), workspaces (`workspace.py`), patch capture (`patches.py`), agent calls and isolation flags (`agents.py`), the ledger (`ledger.py`), preflight and probes (`preflight.py`), grading and controls (`grading.py`), the run (`run.py`), lock, adjudication and evaluation (`adjudicate.py`), scoring (`score.py`, `stats.py`), sizing (`power.py`) and release (`release.py`). `bench.py` is the command line.
2. Configs: `fixture` (offline, stub agents) and `verified-historical` (the real study template; policy caps are the owner's to set before `init`). Fixtures cover good, bad, falsely rejected and checker-discordant patches.
3. Offline tests for every rule the code enforces. Update `pnpm cr bench` usage. Draft pull request #160.
4. Blind code review by Codex on Astra and Antigravity on Neon.
5. Calibration on the owner's Mac only after the owner says go.


## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` implements DESIGN.md v3.3: a frozen protocol, calibration then sizing then phase 1, isolated single-commit workspaces with isolated sign-in, matched capabilities, the failure taxonomy, grading by test ID with controls, a blind adjudication queue built before evaluation, the frozen statistics, and a release gate. Every step is started by hand and refuses to run out of order. Subscription billing is verified before any call; no API key is used. The offline tests pass with no network and no model calls. Nothing runs on the owner's Mac until the owner says go for calibration.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
