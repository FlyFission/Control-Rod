# Trace: checker attempts and sticky fails

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| CA-01 A re-run on the same digest after a fail is refused, with a reason. | `queueRun` in `services/api/src/work.ts`; `STICKY_FAIL_REASON` | `checker-attempts.test.ts` "refuses a re-run..." | implemented and tested |
| CA-02 A re-run after the deliverable digest changes is allowed. | `currentDeliverable` / `hasStickyFail` | same file, "allows a check after the deliverable digest changes" | implemented and tested |
| A signed override allows one re-run and is recorded. | `recordRecheckOverride`, `checker_recheck_uses` | same file, override then `POST /checks`, `recheck_overrides` on the package view | implemented and tested |
| Every attempt is listed in order, including inconclusive ones. | `checker_attempts`, `GET /packages/:id/checker-attempts`, package view (latest 50), package page and case view | same file, "keeps quota and inconclusive attempts"; `checker-history.test.tsx` | implemented and tested |
| A timeout after a fail does not hide the fail and does not count as pass. | `classifyCheckerOutcome`, `governingVerification` | same file: `pre_check.outcome` stays `fail`, timeout `counts_as` is `inconclusive`, Accept stays refused | implemented and tested |
| Timeout, error, quota and cancelled count as inconclusive. | `classifyCheckerOutcome` | unit cases in the same file; a timeout with no earlier fail can be requeued and is not a pass | implemented and tested |
| Attempts and overrides are append-only. | migration `020-checker-attempts` | admin update/delete rejected with "append only" | implemented and tested |
| A fail recorded before the attempts table still refuses a re-check, and is copied into the history at startup. | `governingDecisive` unions `verifications`; `backfillCheckerAttempts` | "copies a fail from the verification the checker run wrote" | implemented and tested |
| A queued check is stopped at claim and at admission when a fail governs and that run has no override use. | `preCheckClaimGate` | "stops a check that was queued before the fail"; "does not admit a pass once a fail governs" | implemented and tested |
| A pass from an earlier revision does not govern after the acceptance criteria change and the files do not. | `governingVerification` binds a pass to the current revision | "does not reuse a pass after the acceptance criteria change" | implemented and tested |
| The override is spent only once the check is running. A held claim, startup reconciliation, and a stop before claim leave it unused. Admission cannot spend one. | `consumeClaimedOverride`, `preCheckClaimGate` | "keeps an override when a claim is held by a budget"; "does not let a running check spend an override at admission" | implemented and tested |
| An overridden pass on an earlier revision clears that fail. The earlier verification is not the new revision's pre-check. | `governingDecisive`, `subjectOf` | "lets an overridden pass on the earlier revision clear that fail"; "does not show an earlier revision's fail" | implemented and tested |
| Criterion results are those of the governing verification. | `currentCriterionResults` selects by `verification_digest` | `preparation-results.test.ts` pass then inconclusive recheck | implemented and tested |
| A checker lost because the daemon restarted is still an attempt. | `runEvidence` calls `recordCheckerAttempt` | "records an attempt when a restart reports the checker process gone" | implemented and tested |

The three-round prepared-check test writes a new deliverable each round (`preparation-results.test.ts`). A fail now sticks to the previous digest, so that test no longer re-checks identical bytes.

No kernel source file was edited, and a sticky refusal is not a new kernel action. `subjectOf` now chooses the governing verification and that is what `decide` receives. A later inconclusive verification is not substituted when a pass or a fail exists. `currentCriterionResults` takes `(q, pkg, verification, lockEvidence)` and selects rows by `verification_digest`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
