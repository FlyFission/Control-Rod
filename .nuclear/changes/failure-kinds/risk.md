# Risk: Typed failure reasons and one safe retry for author runs

- R-01: a retry while a process of the first run is still alive. A retry needs the daemon's containment report. On macOS that is the process group, which cannot see a process that left its group. This is the same footing the existing restart retry already accepts under a signed auto policy, and the retry's reconciliation says in words that a process group cannot prove a process that left the group stopped. A cgroup claim is cross-checked against the receipt on record, the same rule that settles an unknown outcome.
- R-02: a retry that costs tokens and fails again. It happens once per run chain, never after a requeue by the owner, and never for a timeout or the breaker.
- R-03: the kind steering the server is agent-written. It is not. The daemon sets it from its own error values, and the API keeps only a value of the enum. Any other value, from a newer daemon for example, is dropped without refusing the run, so it never decides a retry. A kind also never outlives a later check: when the checkout or output collection changes the failure, the daemon sends no kind.
- R-04: older daemons send no kind. They behave exactly as before, because the restart text check stays.
- Trust surface: `spec/` gains an additive enum and optional fields, not a major version. The owner's merge-on-green permission is the recorded yes.

## Selected mode

- **Mode:** Standard
- Basis: additive contract, server rule bounded by existing policy checks, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every failed run the daemon can place carries a fixed failure kind, taken from the daemon's own error values. An author run whose agent quit with an error, or that the daemon stopped after losing contact, runs again once on its own under a signing policy that lets cards run. That holds only when the daemon accounted for its processes. Every other failure stops for the person as before. API and Go tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
