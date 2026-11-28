# Trace: Practice agent: watch the whole loop on a bundled sample, with no account

| Need | Code | Test |
| --- | --- | --- |
| Practice roles run with no process and no model, and narrate | `daemon/internal/runner/adapter_practice.go`, `daemon.go` copyRunOutputs | `adapter_practice_test.go` TestPracticeLoopRunsEveryRoleWithoutAProcess |
| The practice checker fails work that misses the criteria | `adapter_practice.go` practiceCheck | TestPracticeCheckerFailsWorkThatMissesTheCriteria |
| A practice run refuses a checkout and another role, and stops when asked | `adapter_practice.go` RunPractice | TestPracticeRefusesACheckoutAndAnotherRole, TestPracticeStopsWhenTheRunIsStopped |
| `controlrod check` never uses the practice checker | `check.go` resolveCheckerRuntime | TestStandaloneCheckNeverUsesThePracticeChecker |
| Fake stays test-only | `adapter_fake.go` (unchanged gate) | `adapter_test.go` Detect cases |
| Starting needs the passkey and makes one practice project | `admin.ts` project.practice-start, `practice.ts` startPracticeProject | `services/api/test/practice.test.ts` "starting the practice project" |
| A practice agent is refused on a real project, and gets none of its work | `workspace-projects.ts`, `practice.ts` guardPracticeCapture, `work.ts` claim and startRun | practice.test.ts "practice and real work never meet" |
| A practice card walks intake, release, author, pre-check, accept, with no pull request | `work.ts` claim, `app.ts` /practice/cards | practice.test.ts "a practice card walks the whole loop" |
| Entry point in Setup and the first-run guide; labels | `PracticeStart.tsx`, `Setup.tsx`, `FirstRunGuide.tsx`, `Card.tsx`, `CaptureCard.tsx`, `BoardView.tsx` | `apps/web/src/components/practice.test.tsx`, `pages/setup.test.tsx` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a machine with no agent account, Try a practice run in Setup or in the first-run guide makes the practice project (signed with the passkey) and one card. The practice agents plan, author and pre-check it with no model and no process; the person releases and accepts with the passkey, and no pull request opens. The API refuses a practice agent on any other project and never gives one any other project's run. The fake runtime stays test-only. Daemon, API and web tests pass, and `pnpm spec` shows no drift.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
