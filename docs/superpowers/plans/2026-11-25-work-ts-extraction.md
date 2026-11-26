# work.ts extraction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `services/api/src/work.ts` into the four services named by issue #121, without changing behavior.

**Architecture:** HTTP stays in `app.ts`. `queueRun` and `MAX_RUN_EVENTS` become leaves so the four services do not import each other. Acceptance does not import execution. Publish stays a callback on `WorkConfig`. Each task moves functions and updates imports. No facade left at the end.

**Tech Stack:** TypeScript, Fastify, Postgres transactions via `command()`, Rust kernel via `decide()`.

**Spec:** Issue #121 and `docs/plan/2026-11-25-work-ts-boundaries.md`.

## Global Constraints

- Contracts in `spec/` are the source of truth. Regenerate; never hand-edit generated code.
- Never edit a trust surface without a recorded yes. This plan does not add a kernel action. `override-independence` is already a kernel action. `recheck-override` is a server rule and must stay one.
- No engineering number is typed by a model. Values come from scripts or tools with recorded inputs, outputs and digests.
- Authorization stays `requireAuthority` and `requireHardwareKey` inside the writer transaction. Do not copy those checks into a second module.
- `autoDecide` runs inside the caller's transaction. A refusal before writing leaves that transaction unchanged.

## Review Focus

- A move that calls `decide()` or `requireAuthority` in both the old file and the new one. Expected: one call, in the writer transaction, same refusal code as before.
- `queueRun` reached by two services importing each other. Expected: both import the leaf, and neither imports the other for it.
- `finishPreCheck` copied into verification while `complete` still has a copy. Expected: one function, called from `complete`.
- `autoDecide` opened in its own `command()` instead of the caller's transaction. Expected: a refusal still leaves the triggering intake or pre-check written, and the card waiting.
- Challenge bytes for an independence override or a recheck changed. Expected: `test/work-characterization.test.ts` fails.

---

### Task 1: Break the budgets cycle

**Files:**
- Create: `services/api/src/run-limits.ts`
- Modify: `services/api/src/work.ts`
- Modify: `services/api/src/budgets.ts`
- Test: `services/api/test/budgets.test.ts`

**Interfaces:**
- Consumes: `MAX_RUN_EVENTS` as currently exported from `work.ts`
- Produces: `export const MAX_RUN_EVENTS` from `run-limits.ts`. `work.ts` and `budgets.ts` both import it. `budgets.ts` does not import `work.ts`.

- [ ] **Step 1: Run the pin**

Run: `cd services/api && pnpm test test/budgets.test.ts test/work-characterization.test.ts`
Expected: pass

- [ ] **Step 2: Move `MAX_RUN_EVENTS` to `run-limits.ts` and update both imports**

Do not change the value. Do not leave a re-export on `work.ts`.

- [ ] **Step 3: Run the pin again**

Run: `cd services/api && pnpm test test/budgets.test.ts test/work-characterization.test.ts`
Expected: pass

- [ ] **Step 4: Commit**

### Task 2: Move the pure contracts

**Files:**
- Create: `services/api/src/work-contracts.ts`
- Modify: `services/api/src/work.ts`
- Test: `services/api/test/work-characterization.test.ts`

**Interfaces:**
- Consumes: nothing from the four services
- Produces: `overrideChallenge`, `recheckChallenge`, `draftEtag`, `publishBranchOf`, `modelMismatch`, `decisionChallenge`, `fixScope`, `changedPaths`, `outsideScope`, `prBody`. Same signatures as today.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/work-characterization.test.ts test/scoped-send-back.test.ts test/publish-checkout.test.ts`
Expected: pass

- [ ] **Step 2: Move those functions. Update imports in `work.ts` and the tests. No re-export.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 3: Move `queueRun` to a leaf

**Files:**
- Create: `services/api/src/work-queue.ts`
- Modify: `services/api/src/work.ts`

**Interfaces:**
- Consumes: `run-limits.ts`, `budgets.ts`, `events.ts`. Not intake, execution, verification, or acceptance.
- Produces: `queueRun(c, cfg, packageId, revision, role, round, requeueOf?, demand?)`. Same refusal and event behavior as the private function today.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/runs.test.ts`
Expected: pass

- [ ] **Step 2: Move `queueRun` and the private helpers only it needs. Callers in `work.ts` import it. It does not import `work.ts`.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 4: Move acceptance

**Files:**
- Create: `services/api/src/work-acceptance.ts`
- Modify: `services/api/src/work.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/src/admin.ts`
- Test: `services/api/test/authority.test.ts`, `services/api/test/signing-policy.test.ts`

**Interfaces:**
- Consumes: `work-queue.ts` `queueRun`, `work-contracts.ts` `decisionChallenge`. Not execution, not publish.
- Produces: `applyDecision`, `autoDecide`, `packageActions`, `decisionSubject`. `autoDecide` still takes the caller's `Tx` and returns `Promise<boolean>`.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/authority.test.ts test/signing-policy.test.ts test/app.test.ts`
Expected: pass

- [ ] **Step 2: Move the four functions and `decideTx`. `complete` and `finishPreCheck` import `autoDecide` from this module. Update `app.ts` and `admin.ts` imports. No re-export.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 5: Move publish

**Files:**
- Create: `services/api/src/work-publish.ts`
- Modify: `services/api/src/app.ts`
- Test: `services/api/test/publish-checkout.test.ts`

**Interfaces:**
- Consumes: `work-contracts.ts` `publishBranchOf`. Not acceptance.
- Produces: `publishAccepted(db, id, revision, atStart?)` and `resumePublishing(db)`. `app.ts` still passes `publishAccepted` as `cfg.publish`.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/publish-checkout.test.ts`
Expected: pass

- [ ] **Step 2: Move the functions. Update `app.ts`. No re-export.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 6: Move verification's public functions

**Files:**
- Create: `services/api/src/work-verification.ts`
- Modify: `services/api/src/app.ts`
- Test: `services/api/test/checker-attempts.test.ts`, `services/api/test/runs.test.ts`

**Interfaces:**
- Consumes: `work-queue.ts`, `work-acceptance.ts` `autoDecide` (from `finishPreCheck` only). Not execution.
- Produces: `requestCheck`, `checkerAttempts`, `overrideIndependence`, `overrideSubject`, `overrideChallenge` is already in contracts, `recordRecheckOverride`, `recheckSubject`, and `finishPreCheck` exported for `complete` to call. One copy.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/checker-attempts.test.ts test/runs.test.ts`
Expected: pass

- [ ] **Step 2: Move the functions, including `finishPreCheck`. `complete` imports `finishPreCheck`. Delete the old copy. Update `app.ts`.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 7: Move intake

**Files:**
- Create: `services/api/src/work-intake.ts`
- Modify: `services/api/src/app.ts`
- Test: `services/api/test/app.test.ts`, `services/api/test/disclosure.test.ts`

**Interfaces:**
- Consumes: `work-queue.ts`, `work-acceptance.ts` `autoDecide` for a drafted package's release. Not execution.
- Produces: `createCapture`, `classifyCapture`, `dismissCapture`, `listCaptures`, `updateDraft`.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/app.test.ts test/disclosure.test.ts`
Expected: pass

- [ ] **Step 2: Move the functions. Update `app.ts`. No re-export.**

- [ ] **Step 3: Run the same command.** Expected: pass

- [ ] **Step 4: Commit**

### Task 8: Rename what remains to execution

**Files:**
- Rename: `services/api/src/work.ts` to `services/api/src/work-execution.ts`
- Modify: every remaining importer (`app.ts`, `inbox.ts`, `person-verification.ts`, `figures.ts`)
- Test: `services/api/test/runs.test.ts`, `services/api/test/work-characterization.test.ts`

**Interfaces:**
- Consumes: `work-queue.ts`, `work-verification.ts` `finishPreCheck`, `work-acceptance.ts` `autoDecide`
- Produces: `claim`, `complete`, `runLog`, `stopRun`, `requeueRun`, `sweepLost`, `reconcileRun`, `runEvidence`, plus the package read helpers those importers still use (`currentPackage`, `office`, `packageActions` already moved, `subjectOf`, `latestAuthorRun`). Package reads that more than one service uses go to `work-package.ts` in this task if moving them with execution would make inbox or person-verification import execution.

- [ ] **Step 1: Run** `cd services/api && pnpm test test/runs.test.ts test/inbox.test.ts test/person-verification.test.ts test/work-characterization.test.ts`
Expected: pass

- [ ] **Step 2: Rename the file. Update imports. `rg "from \"./work.js\"" services/api/src` prints nothing.**

- [ ] **Step 3: Run the same command, then** `cd services/api && pnpm test`
Expected: pass

- [ ] **Step 4: Commit**

## Stop

Executing this plan is a separate program. Do not start it from the investigation pull request.
