# Basis: innocent until proven guilty

**Change slug:** `innocent-until-proven`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Need

The owner, 2026-11-25: "You're adding too much bureaucracy over everything that you do. And guardrails where they shouldn't be." and "Innocent until proven guilty, not the latter." The app should let a step go unless there is evidence of a real problem.

## What changes

1. **Notes are optional everywhere.** Send back, Reject, Accept with findings, reconcile a lost run, allow a check on the author's runtime, SCRAM pull, quarantine review, SCRAM restart and sealing the record no longer wait for typed text. An empty note is sent as a plain fallback (`NOTE_FALLBACK` in `apps/web/src/lib/decide.ts`, for example "Rejected with no note typed."), so the record still says what happened and the kernel's reason rule is met without changing the kernel.
2. **Same agent for writing and checking is allowed on a project.** The project dialog and the API no longer refuse a project whose author and checker use the same CLI. The dialog says so in one line. The pre-check hold before acceptance is unchanged, so the independence protection stays where it matters.
3. **The runtime staging folder is fixed, not refused.** If the daemon's own staging folder is readable by others, it is set to private (0700) and used. A folder that is a link, or owned by someone else, is still refused.

## Kept on purpose

Passkeys for big settings, SCRAM, quarantine, the kernel's floors, and the agent sandboxes (config files that would loosen a sandbox, sign-in checks). Agent version pins and passkey steps on cards are handled in their own threads.

## Out of scope

`kernel/`, `policies/`, `spec/`, `.github/`, `tests/redteam/`: untouched.

## Exit criteria

Web tests, the daemon staging test and the API refusal catalogue test pass; every note box can be signed empty and sends its fallback.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
