# Plan: API errors and limits: plain refusals, body limits, one capture contract

1. Typed passkey reasons and compare-and-swap counter in `auth.ts`; route callers use `requireAssertion` and `signatureMismatch`.
2. Body limits and preauth hooks in `app.ts`; plain size and JSON refusals; new refusal codes in `refusals.ts`.
3. Shared capture contract in `spec/work.tsp`, `pnpm spec`, `captureRequest` and `createCapture` in `work.ts`, page limits from the generated JSON.
4. Kernel status map in `work.ts`; fake runtime gate in `runtimes.ts`, test harness and live e2e stack set `CONTROLROD_ALLOW_FAKE=1`.
5. Smaller fixes: `base64.ts`, model aliases, `repos.ts` git errors and collisions, `seals.ts` origin, `sweep-check.ts`, migration 029 and lock, `workspace-projects.ts` backup, web `passkeyErrors.ts`, `scripts/lib/cards.mjs`.
6. Update tests whose expected codes changed on purpose; add `test/api-errors-limits.test.ts`, web and script tests.
7. Typecheck, related API suites, the full API suite once, web and script tests, repo gates. The owner decides on merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A refused passkey says why (expired, unknown, another person, wrong address, counter gone back, not verified, bad signature), and "needs your passkey" is said only when no signature came. A passkey counter only moves forward, under compare-and-swap. Routes that take large bodies check the caller before the body is read, and every other route keeps a 1 MB limit with a plain size refusal. Captures follow one generated contract shared by the page and the API: a bad lane or source is refused, text is never cut short, and attachments have a count limit and must be clean base64. Kernel denials map to 409 or 422 where they fit. Seals still verify after the app moves to another port. The fake runtime is offered only where CONTROLROD_ALLOW_FAKE=1. Typecheck and the API, web and script tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
