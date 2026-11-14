# Trace: checker attempts and sticky fails

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| A re-run on the same digest after a fail is refused, with a reason. | `queueRun` in `services/api/src/work.ts`; `STICKY_FAIL_REASON` | `checker-attempts.test.ts` "refuses a re-run..." | implemented and tested |
| A re-run after the deliverable digest changes is allowed. | `currentDeliverable` / `hasStickyFail` | same file, "allows a check after the deliverable digest changes" | implemented and tested |
| A signed override allows one re-run and is recorded. | `recordRecheckOverride`, `checker_recheck_uses` | same file, override then `POST /checks`, `recheck_overrides` on the package view | implemented and tested |
| Every attempt is listed in order, including inconclusive ones. | `checker_attempts`, `GET /packages/:id/checker-attempts`, package view, package page and case view | same file, outcome order fail, timeout, quota, inconclusive; `checker-history.test.tsx` | implemented and tested |
| A timeout after a fail does not hide the fail and does not count as pass. | `classifyCheckerOutcome`, `governingVerification` | same file: `pre_check.outcome` stays `fail`, timeout `counts_as` is `inconclusive`, Accept stays refused | implemented and tested |
| Timeout, error, quota and cancelled count as inconclusive. | `classifyCheckerOutcome` | unit cases in the same file; a timeout with no earlier fail can be requeued and is not a pass | implemented and tested |
| Attempts and overrides are append-only. | migration `020-checker-attempts` | admin update/delete rejected with "append only" | implemented and tested |

The three-round prepared-check test writes a new deliverable each round (`preparation-results.test.ts`). A fail now sticks to the previous digest, so that test no longer re-checks identical bytes.

The kernel was not changed. `decide` still sees the governing pass or fail. A sticky refusal is not a new kernel action.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
