# Basis: first macOS install fixes

**Change slug:** `codex-0171-mac-install`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether the daemon may run Codex 0.171.0, and whether doctor and the start log report agent refusals plainly.

## Mission / need

The owner's first install on macOS (2026-11-23) succeeded, but the daemon refused Codex 0.171.0 for nine unqualified features, so a stock Mac had no cross-vendor checker, and `pnpm cr doctor` had said Codex was fine. Split out of the agent update prompt change so the fix can land first.

## What this change does

- Qualify the nine features from upstream source (`evidence/codex-0.171.0-features.md`); any other unqualified feature is still refused.
- `controlrod runtimes` runs the daemon's own probe and preflight per agent; `pnpm cr doctor` prints it, so a refusal shows before start.
- Quieter start: one line for agents detected but not yet supported, no doubled period, and on macOS the process-group note is information, not a warning (cgroups are Linux only). pnpm's update banner is off for this repository.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
