# Risk: API errors and limits: plain refusals, body limits, one capture contract

- R-01: a passkey change weakens sign-in. WebAuthn verification calls and options are unchanged; only the failure is classified. The counter write is stricter (compare-and-swap), so a cloned passkey racing the real one fails one of the two.
- R-02: a body limit refuses real work. Routes that carry files or reports keep large limits; tests cover a 3 MB attachment through a signed-in capture.
- R-03: a client branches on 403 for a kernel denial. The web client shows the message and change and does not branch on these statuses; the daemon treats 4xx other than 401, 408 and 429 as final, as before.
- R-04: a capture that used to pass is now refused (bad lane, bad source, text over 20,000, more than 20 files, damaged base64). Each refusal says what to change; before, such captures were silently changed.
- R-05: accepting a seal's own origin lets a forged seal through. The origin must be https on the RP ID or one of its subdomains, or http on localhost; the signed authenticator data still binds the RP ID, and the seal must still be recorded in the chain with its key.
- R-06: page reads skip a needed sweep. The read-only check mirrors each step of `sweepLost`, and the timer sweep is unchanged.
- R-07: migration 029 may collide with another branch's 029. Whoever merges second renumbers.
- Trust surface: `spec/` gains additive models only, no major version. No kernel, policy, workflow or ADR file changes.

## Selected mode

- **Mode:** Standard
- Basis: contained API and page changes behind existing tests; one additive index migration; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A refused passkey says why (expired, unknown, another person, wrong address, counter gone back, not verified, bad signature), and "needs your passkey" is said only when no signature came. A passkey counter only moves forward, under compare-and-swap. Routes that take large bodies check the caller before the body is read, and every other route keeps a 1 MB limit with a plain size refusal. Captures follow one generated contract shared by the page and the API: a bad lane or source is refused, text is never cut short, and attachments have a count limit and must be clean base64. Kernel denials map to 409 or 422 where they fit. Seals still verify after the app moves to another port. The fake runtime is offered only where CONTROLROD_ALLOW_FAKE=1. Typecheck and the API, web and script tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
