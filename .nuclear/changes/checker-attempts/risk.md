# Risk: checker attempts and sticky fails

- **Mode:** Standard
- Execution owner: the implementing agent, under the owner's instruction to implement milestone 3.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture or workflow is edited. Spec changes are additive inside API 0.1 (new models and optional package-view fields). No spec major version.
- Scope: `services/api`, `spec/`, `apps/web` package and case pages, and this packet. `daemon/internal/runner` is not touched.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A later inconclusive attempt replaces a fail, so acceptance treats the work as unchecked or as a pass. | The governing pre-check is the latest pass or fail on that digest. Timeout, error, quota and cancelled never count as pass and never write over the fail. | A package view whose `pre_check.outcome` is pass after a timeout that followed a fail. |
| R-02 | The sticky refusal is only at queue time, so a check already queued starts after a fail on the same digest. | `queueRun` refuses a new insert. `claim` and completion stop or refuse admission when a governing fail has no `checker_recheck_uses` row for that run. Startup reconciliation stops queued and running checks in that state. | A succeeded pre-check whose verification is pass, on a digest whose governing outcome was fail, with no use row. |
| R-03 | An override is reusable, so one signature becomes retry shopping. | The override row is append-only. Spending it inserts one use row. The next check needs another signature. | Two checks citing the same override id. |
| R-04 | The kernel is left unaware, so a future caller that skips the server still accepts a hidden fail. | The outcome passed into `decide` is the governing one. A new kernel action was not added; that remains a protected change if the owner wants the floor inside the kernel. | A decision path that reads a raw verification row newer than the governing attempt. |
| R-05 | Recording an attempt on every terminal pre-check rolls back a completion when the record is invalid. | The attempt is validated against `CheckerAttempt.json` in the same transaction. The suite covers pass, fail, inconclusive, timeout and quota. | A completion of a pre-check that stays running because the attempt record is rejected. |

## Selected mode

- **Mode:** Standard
- Basis: new persisted records and a server-side refusal. No protected surface and no spec major version.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
