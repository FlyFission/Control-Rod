# Ship: API errors and limits: plain refusals, body limits, one capture contract

Release decision: **pending**. Merging is the owner's decision.

- Rollback: revert the merge. Migration 029 only adds an index; a reverted app starts against a database that has it only if 029 is also removed from schema_migrations (its down SQL does both).
- Monitoring after merge: a refused passkey on sign-in or a signed step names its reason; a capture with a misspelt lane is refused with the list of lanes; the sign-in page on Windows names Windows Hello; a daemon with `CONTROLROD_ALLOW_FAKE` unset never claims a fake run.
- Limits: tests use a virtual authenticator and jsdom, never a real passkey window. Clients that read refusal codes see new ones: `passkey-*` (including `passkey-overtaken` for a signature that lost a race to a newer one from the same passkey), `signature-mismatch`, `too-many-attachments`, `not-json`, and 409 or 422 for three kernel denials. Migration 029 may need renumbering if another branch merges a 029 first. Lane floors still read as the default when the stored preferences are unreadable, until the next write keeps the old value aside. An honest older signature checked after a newer one is recorded still reads `passkey-counter`. The runs.test capture-dismissal test runs 0.6 to 5 s in CI on main and other branches for a cause not yet found (verification E-10).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A refused passkey says why (expired, unknown, another person, wrong address, counter gone back, not verified, bad signature), and "needs your passkey" is said only when no signature came. A passkey counter only moves forward, under compare-and-swap. Routes that take large bodies check the caller before the body is read, and every other route keeps a 1 MB limit with a plain size refusal. Captures follow one generated contract shared by the page and the API: a bad lane or source is refused, text is never cut short, and attachments have a count limit and must be clean base64. Kernel denials map to 409 or 422 where they fit. Seals still verify after the app moves to another port. The fake runtime is offered only where CONTROLROD_ALLOW_FAKE=1. Typecheck and the API, web and script tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
