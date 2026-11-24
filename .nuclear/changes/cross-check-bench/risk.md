# Risk: cross-vendor checking benchmark

- **Mode:** Standard
- Execution owner: Claude (project thread "Benchmark cross-vendor checking on real tasks").
- Decision owner: Ben Huffer. No trust surface is edited (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, kernel decision functions).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Model calls start without the owner's go, or past the caps. | `run` prints the plan and stops unless `--yes`; hard call cap across resumes; calibration allocation; phase-1 token gate; frozen deadline. | A call launched past a cap (tests). |
| R-02 | Spend beyond existing subscriptions. | `preflight` verifies the subscription route and refuses billing keys in env or CLI config; keys are stripped from each call's environment. | Any API-key route in preflight. |
| R-03 | A result is shared without its context, or cherry-picked. | Protocol, sizing and manifest frozen before phase 1; `share.md` only from the released manifest with mandatory disclosures; exclusions close at the first call. | A post figure with no n or interval, or a task struck after a call. |
| R-04 | The checker or adjudicator is not blind. | Opaque single-commit workspaces; checker prompt is the issue and the diff; adjudication queue anonymized and built before `evaluation.json`. | A probe or test showing a leak. |
| R-05 | An agent damages the owner's machine or reads private files. | Network-off sandboxes, read-only checker trees, isolated sign-in stores, HOME and run directory denied, probes before any task call. | Any failed isolation probe stops the run. |
| R-06 | Personal setup leaks into the public repository or a release. | `agents.local.json` ignored by git; release privacy scan refuses emails and tokens and redacts host paths. | A committed or released account, token or path. |
| R-07 | The benchmark is read as a scheduled job. | No cron, timer or workflow; quota pauses resume only when a person runs `run` again. | Any schedule added. |

## Selected mode

- **Mode:** Standard
- Basis: a self-contained script and a CLI subcommand; no protected surface; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` implements DESIGN.md v3.3: a frozen protocol, calibration then sizing then phase 1, isolated single-commit workspaces with isolated sign-in, matched capabilities, the failure taxonomy, grading by test ID with controls, a blind adjudication queue built before evaluation, the frozen statistics, and a release gate. Every step is started by hand and refuses to run out of order. Subscription billing is verified before any call; no API key is used. The offline tests pass with no network and no model calls. Nothing runs on the owner's Mac until the owner says go for calibration.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
