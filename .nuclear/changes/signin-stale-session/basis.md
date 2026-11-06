# Basis: a sign-in page drawn from an out-of-date session

**Change slug:** `signin-stale-session`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-05
**Decision this basis supports:** whether the sign-in page may reload the session instead of showing certain refusals.

## Mission / need

On the first pilot (2026-11-05) the owner registered the first passkey, then saw "You can add a passkey only to your own account; an administrator invites new people" from a sign-in page still showing "Set up this machine", while the browser already held a valid session. Why the page was out of date was not recorded; section "Root cause" gives the two mechanisms that reproduce it. The server answered correctly for a signed-in person adding a passkey; the page showed a refusal written for a different case.

## Root cause (found after review)

Observed on 2026-11-05: after registering, the owner saw the setup page and then the own-account refusal; leaving and returning to the page showed him signed in. The exact browser sequence was not recorded. Two mechanisms reproduce that symptom in tests, and both are fixed here; which one occurred in the pilot is a supported hypothesis, not an observation. The first fix covered a page drawn from an out-of-date session (a second tab or Back). A pull request review asked for a test through the gate that switches between sign-in and the app. A test against a stand-in for `Root` (the same session query decides what shows; not `Root` itself) demonstrated a second mechanism: after a successful registration or sign-in, the page called `QueryClient.clear()` and then set the new session. Clearing removes the session query that `Root` observes, so the app never redrew and the setup page stayed on screen. Pressing Register again was then correctly refused as adding a passkey to someone else's account. Sign-out had the same defect. A Codex review then found two more ways an earlier session could survive: a session request already in flight could finish after the change and put the earlier session back, and the mutation cache kept what the earlier person had submitted. The fix, `adoptSession` in `apps/web/src/lib/session.ts`, moves a session generation on and cancels every query in flight, removes every other query and every mutation, and updates the session in place; the three places that write to the cache after awaiting (preparation save and reload, criteria save) drop a result whose request started under an earlier session; sign-in, registration, recovery and sign-out all use it.

## Fix (first, kept as a guard)

When registration or sign-in is refused with `own-account-only`, `forbidden`, `step-up-required` or `not-registered`, the page reads the session again and redraws from it: a signed-in browser goes to its session, a set-up machine shows sign-in with a plain sentence, and a machine not yet set up shows setup. Every other refusal is shown as before. The server is unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
