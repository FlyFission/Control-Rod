# Basis: API errors and limits: plain refusals, body limits, one capture contract

**Change slug:** `api-errors-and-limits`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

Review batch 6 (review of commit cd0595c, rechecked on main 9cd6e04) found that the API refuses many requests with words a person cannot act on, or accepts what it should refuse. A passkey that did not verify always read "This command needs your passkey" (#207). Any caller could send a 150 MB body to any route before signing in (#200). The page and the API kept separate capture limits, and a misspelt lane was silently dropped, leaving the capture unclassified (#205). Other findings: raw kernel parse errors (API-4), model names silently remapped to another model (API-9), raw git command lines in refusals and no output limit (API-12), unclear slug collision refusals (API-13), seals that fail after a port change (API-14), page reads that take the sweep's writer locks (API-16), no index on the event subject (API-17), every kernel denial as 403 (API-18), the test-only fake runtime claimable in production (API-19), lenient base64 in completions (API-21), one corrupt preferences value wiping every project's preferences (API-22), no compare-and-swap on the passkey counter (API-26), raw WebAuthn errors and "Touch ID works" on every system (WEB-10), and a raw SyntaxError from the card commands (CLI-15). The design is our own; no donor code is used.

## Proposal

1. `auth.ts`: `checkAssertion` returns a typed reason; `requireAssertion` throws a refusal with one code per reason (`passkey-expired`, `passkey-unknown`, `passkey-other-person`, `member-inactive`, `passkey-origin`, `passkey-counter`, `passkey-overtaken`, `passkey-not-verified`, `passkey-bad-signature`). A signature that verifies but covers another request is `signature-mismatch`. WebAuthn verification itself is unchanged. The counter is written only if it still moves forward (compare-and-swap). A signature that verified but lost that write to a higher count from the same passkey reads `passkey-overtaken`, a calm refusal, because two honest tabs do this. A lower or equal count still reads `passkey-counter`, the possible-copy refusal.
2. `app.ts`: a 1 MB default body limit. Captures (32 MB), package edits (8 MB) and daemon reports (150 MB) raise it per route and check the caller in `onRequest`, before the body is read. Size and JSON refusals are plain sentences with a code.
3. `spec/work.tsp`: `CaptureRequest` and `CaptureLimits` (additive); `Captures.NewCapture` is now `CaptureRequest`, same shape. The API and the page read the same generated limits. A bad lane or source is refused, visible text over the limit is refused, more than 20 files is refused, and attachment base64 must be canonical.
4. Kernel denials `wrong-state` and `missing-pre-check` answer 409, `reason-required` 422; the others stay 403.
5. Smaller fixes: strict base64 for completion outputs; shorthand-only model aliases; plain git errors with a 16 MB output limit; slug collision refusals that name what holds the folder; seals checked against the origin they were signed at when it belongs to the RP ID; page reads sweep only when a read-only check finds work, and share one sweep; migration 029 adds an index on event subject and type; the fake runtime only where `CONTROLROD_ALLOW_FAKE=1`; unreadable project preferences kept aside before a write; plain passkey errors and a hint that names Touch ID only on Apple devices; a plain card command error for a reply that is not JSON.

## Out of scope

Changing the checkout folder layout to make slugs unique (API-13 stays fail closed with a clearer refusal). Failing closed on lane floors when the preferences value is unreadable. The preparation subject refusal in `preparation/subjects.ts`, which keeps 403.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A refused passkey says why (expired, unknown, another person, wrong address, counter gone back, not verified, bad signature), and "needs your passkey" is said only when no signature came. A passkey counter only moves forward, under compare-and-swap. Routes that take large bodies check the caller before the body is read, and every other route keeps a 1 MB limit with a plain size refusal. Captures follow one generated contract shared by the page and the API: a bad lane or source is refused, text is never cut short, and attachments have a count limit and must be clean base64. Kernel denials map to 409 or 422 where they fit. Seals still verify after the app moves to another port. The fake runtime is offered only where CONTROLROD_ALLOW_FAKE=1. Typecheck and the API, web and script tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
