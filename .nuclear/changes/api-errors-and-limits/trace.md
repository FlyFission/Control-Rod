# Trace: API errors and limits: plain refusals, body limits, one capture contract

| Need | Code | Test |
| --- | --- | --- |
| A refused passkey says why (API-2, #207) | `auth.ts` checkAssertion, passkeyRefused | `api-errors-limits.test.ts` "names a wrong origin...", `admin.test.ts`, `scram.test.ts`, `checker-attempts.test.ts`, `signing-policy.test.ts` |
| Counter only moves forward (API-26) | `auth.ts` compare-and-swap update | "refuses a counter that went backwards", "lets only one of two signatures..." |
| Body limits before sign-in (API-6, #200) | `app.ts` bodyLimit, asPerson, asDaemon | "refuses an unauthenticated large body...", "still takes a signed-in capture..." |
| One capture contract (API-7, #205) | `spec/work.tsp`, `work.ts` captureRequest, `apps/web/src/lib/attachments.ts` | "captures follow one shared contract", `components.test.tsx` |
| Plain JSON refusals (API-4) | `app.ts` canonicalJsonProblem | "plain refusals for JSON..." |
| Real model names pass through (API-9) | `work.ts` MODEL_ALIASES | "passes a real model name through..." |
| Plain git errors and output limit (API-12) | `repos.ts` gitProblem, GIT_OUTPUT_LIMIT | "says git failures in plain words...", `repos.test.ts` |
| Slug collisions refused with what holds the folder (API-13) | `repos.ts` folderTaken | `repos-materialize.test.ts` |
| Seals verify after a port change (API-14) | `seals.ts` sealedOrigin | "still verifies a seal once the app answers at another port" |
| Page reads do not take sweep locks needlessly (API-16) | `sweep-check.ts`, `app.ts` sweepForRead | `budgets.test.ts`, `supervision.test.ts`, `office.test.ts` |
| Event subject index (API-17) | migration 029 | "indexes events by subject and type", migration lock and preservation tests |
| Kernel denials as 409 or 422 (API-18) | `work.ts` KERNEL_STATUS | updated status expectations in the suites |
| Fake runtime gated (API-19) | `runtimes.ts` fakeAllowed, withFake | "the test-only fake runtime" |
| Strict completion base64 (API-21) | `base64.ts`, `work.ts` applyCompletion | "decodes only canonical base64" |
| Unreadable preferences kept aside (API-22) | `workspace-projects.ts` writePrefsMap | "keeps unreadable project preferences aside..." |
| Plain passkey errors, honest hint (WEB-10) | `apps/web/src/lib/passkeyErrors.ts`, `decide.ts`, `SignIn.tsx` | `passkey-errors.test.ts`, `signin.test.tsx` |
| Plain card command error (CLI-15) | `scripts/lib/cards.mjs` | `scripts/test/cards.test.mjs` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A refused passkey says why (expired, unknown, another person, wrong address, counter gone back, not verified, bad signature), and "needs your passkey" is said only when no signature came. A passkey counter only moves forward, under compare-and-swap. Routes that take large bodies check the caller before the body is read, and every other route keeps a 1 MB limit with a plain size refusal. Captures follow one generated contract shared by the page and the API: a bad lane or source is refused, text is never cut short, and attachments have a count limit and must be clean base64. Kernel denials map to 409 or 422 where they fit. Seals still verify after the app moves to another port. The fake runtime is offered only where CONTROLROD_ALLOW_FAKE=1. Typecheck and the API, web and script tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
