# Risk: show Claude Code and Codex in the control room from the start

- **Mode:** Standard
- **Status:** In build, for owner review.
- Decision owner: Ben Huffer. No spec, API, daemon, kernel, policy, red-team fixture, workflow or ADR is edited.
- Scope: `apps/web/src/components/UsageLimits.tsx` and its tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A card with no reading looks like 0% used. | A waiting card has no bar or number, only words. | A meter on a card whose source is none. |
| R-02 | The card claims "signed in" without evidence. | It says signed in only when the daemon's probe reported `auth: signed-in`; otherwise "No reading yet". | A signed-in claim with no probe. |

## Selected mode

- **Mode:** Standard
- Basis: a read-only page change, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
