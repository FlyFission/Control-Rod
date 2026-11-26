# work.ts boundaries

Issue #121. `wc -l services/api/src/work.ts` printed 4014 on `origin/main` at the start of this phase. This page is the map. It does not move code.

HTTP stays in `services/api/src/app.ts`. It calls the functions below. Persistence is the `command(db, name, ...)` transaction named on each row, or the caller's transaction where noted. `readTx` does not write. The Rust kernel is the only state-change decision: every `decide()` site is listed. Do not add a kernel action in an extraction.

## Four services, one shared queue

| Service | Functions | Transaction | Kernel `decide()` |
|---|---|---|---|
| Intake | `createCapture`, `classifyCapture`, `dismissCapture`, `listCaptures`, `updateDraft` | `capture.create`, `capture.classify`, `capture.dismiss`, `draft.edit` | none |
| Execution | `claim`, `complete`, `runLog`, `stopRun`, `requeueRun`, `sweepLost`, `reconcileRun`, `runEvidence` | `run.claim`, `run.complete`, `run.log`, `run.stop`, `run.requeue`, `run.sweep-lost`, `run.reconcile`, `run.reconcile-evidence` | `claim`; `submit-output` inside `complete` |
| Verification | `requestCheck`, `checkerAttempts`, `overrideIndependence`, `recordRecheckOverride`, and `finishPreCheck` (private, called from `complete`) | `check.request`, `run.override-independence`, `check.recheck-override`, inside `run.complete` | `override-independence`; `submit-pre-check`; `revise` when the pre-check does not pass |
| Acceptance | `applyDecision`, `autoDecide`, `packageActions`, `decisionSubject` | `decision.apply`; `autoDecide` uses the caller's transaction and writes nothing until the kernel allows the step | each of `release`, `accept`, `accept-with-findings`, `return`, `reject`. `packageActions` is `readTx`: it previews the same actions and does not write |

`queueRun` is private and is called from intake, execution, verification, and acceptance. It is the shared write. The four services must import it from a leaf. They must not import each other to reach it. Its sticky-fail checks are not private to it: `currentDeliverable`, `hasStickyFail`, and `lockNextOverride` already live in `checker-attempts.ts`, which does not import `work.ts`. `queueRun` and the other callers import that module. They do not copy those functions.

`autoDecide` is called from package drafting inside `complete` (a release) and from `finishPreCheck` (an accept). Those callers import acceptance. Acceptance calls `queueRun` on release. It must not import execution.

`publishAccepted` is not called from acceptance. `app.ts` passes it as `cfg.publish`. Keep that callback. Do not have acceptance import publish.

## Existing cycle

`work.ts` imports `budgets.ts`. `budgets.ts` imports `MAX_RUN_EVENTS` from `work.ts`. Break that before any service move: the constant moves to a leaf both import.

## What a split must not change

The existing suite pins the HTTP and kernel paths: `test/runs.test.ts`, `test/app.test.ts`, `test/authority.test.ts`, `test/signing-policy.test.ts`, `test/scram.test.ts`, `test/budgets.test.ts`, `test/checker-attempts.test.ts`. `test/work-characterization.test.ts` pins the pure contracts that suite does not name: override challenge bytes, recheck challenge bytes, draft ETag, publish branch name, model-mismatch rule.

Authorization stays `requireAuthority` and `requireHardwareKey` inside the writer transaction. Do not copy those checks into a second module.
