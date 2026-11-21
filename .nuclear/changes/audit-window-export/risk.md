# Risk: audit export for a time window

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 choice on the decision card (D1 in `basis.md`).
- Decision owner: Ben Huffer. **Trust surface touched:** `spec/` (one new operation, no change to existing ones), which needs the owner's recorded yes under the sole-maintainer rule. No kernel decision function, policy, red-team fixture or workflow is touched.
- Scope: as in `basis.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Splitting the package-proof code changes how package proofs are judged. | The split keeps every check, its order and its wording; the existing inclusion-proof tests, including every tamper case, pass unchanged. | Any existing seals test edited to pass. |
| R-02 | An export says a window is covered when the seal stops before its end. | `checkCovering` requires the seal head at or after the window's last event; unsealed exports say nothing authenticates them; the Records page tells the person to seal after the window closes. | An authenticated export whose last window event is after the seal head. |
| R-03 | Moving an event's time moves it into or out of the window unnoticed. | `at` is inside each event's digest; the test moves one and the export fails. | A moved time that still verifies. |
| R-04 | The export discloses more than a Member already sees. | It carries the same events as the Records page and package proofs, and is refused on a chain shared by organizations. | Any event outside the caller's organization in an export. |
| R-05 | A bad window string reaches the database or is read in a local zone. | `windowProblem` requires two ISO date-times with a zone, ordered; refused with 400 before any read. | A window accepted without a zone. |

## Selected mode

- **Mode:** Standard
- Basis: a read-only export and contract addition; no state change; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
