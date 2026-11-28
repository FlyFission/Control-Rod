# Risk: Hold cards while an agent's usage limit is used up, and start them at the reset

- R-01: a wrong hold stops work that could run. A hold needs the vendor's own rejected status or 100 percent on a whole-subscription window, plus a reset time still ahead, and it ends at that time whatever the next reading says.
- R-02: a stale reading holds too long. The hold never outlasts the reset time the vendor gave.
- R-03: a missed hold (no reading, or a CLI that does not report). The run behaves as before: it fails at the vendor, and the typed-failure retry (PR #256) applies.
- R-04: a run with no seat goes to another vendor. That is the existing default order with the used-up agent left out, and the blind-check independence rule still applies to checkers.
- Trust surface: `spec/` gains one additive enum value, not a major version. The owner's merge-on-green permission is the recorded yes.

## Selected mode

- **Mode:** Standard
- Basis: claim-time hold through the existing hold mechanism; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
