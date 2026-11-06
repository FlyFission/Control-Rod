# Basis: a sign-in page drawn from an out-of-date session

**Change slug:** `signin-stale-session`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-05
**Decision this basis supports:** whether the sign-in page may reload the session instead of showing certain refusals.

## Mission / need

On the first pilot (2026-11-05) the owner registered the first passkey, then saw "You can add a passkey only to your own account; an administrator invites new people" from a sign-in page still showing "Set up this machine". The page had been drawn from a session read before registration (a second tab, or a page restored with Back), while the browser already held a valid session. The server answered correctly for a signed-in person adding a passkey; the page showed a refusal written for a different case.

## Root cause (found after review)

The first fix treated a symptom. A pull request review asked for a test through the real gate in `Root`, and that test showed the true cause: after a successful registration or sign-in, the page called `QueryClient.clear()` and then set the new session. Clearing removes the session query that `Root` observes, so the app never redrew and the setup page stayed on screen. Pressing Register again was then correctly refused as adding a passkey to someone else's account. Sign-out had the same defect. The fix, `adoptSession` in `apps/web/src/lib/session.ts`, removes every other query and updates the session in place; sign-in, registration, recovery and sign-out all use it.

## Fix (first, kept as a guard)

When registration or sign-in is refused with `own-account-only`, `forbidden`, `step-up-required` or `not-registered`, the page reads the session again and redraws from it: a signed-in browser goes to its session, a set-up machine shows sign-in with a plain sentence, and a machine not yet set up shows setup. Every other refusal is shown as before. The server is unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
