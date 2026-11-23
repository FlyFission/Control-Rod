# Basis: Council-first direction

**Related risk record:** `risk.md`
**Change slug:** `council-first-direction`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether ADR 0024, the research files and the herdr pattern note may merge.

---

## Mission / need

The owner asked, in his Claude project thread "Find where Control Rod stands apart", how Control Rod can stand apart without reinventing the wheel. He restated the goal on 2026-11-22: "the easiest way to have a council of agents (AGY, Codex, Claude, Grok, opencode, mistral, etc.) at the table and at various instances with super flexible and dynamic workflows." On 2026-11-22 he answered "Yes to all that" to four recommendations (pitch, Planner first screen, plain labels with the plant as a theme, a quota spike). On 2026-11-23, after the 15-repository result, he wrote: "I love it. Let's make sure that we get ahead of these things and make the updates to our repository." At 15:14 UTC the same day he accepted author fail-over ("Yes, and it just needs to be logged and flagged, with controls in place") and asked that the end user decide where they come into the picture.

## Fixed inputs

- The owner's messages quoted above.
- Public issue and pull request titles, labels and reaction counts from 15 repositories, pulled 2026-11-23 (digests in `docs/research/user-demand-2026-11/repos/counts_all.json`).
- herdr README at commit `e8d7d9705a7a2c89cef4dd42079379f05685af87`.
- ADR 0019 and ADR 0023 as on `main` at `dcf93c2`.

## What changes

- `docs/adr/0024-council-first.md` (new).
- `docs/research/user-demand-2026-11/` (new): README, persona model, issue pull and classification scripts, outputs, digests.
- `docs/patterns/herdr.md` (new) and one line in `docs/patterns/README.md`.
- One line in `docs/README.md`.
- `docs/patterns/onboarding.md` (new) and its counts (`repos/onboarding_*`), after the owner asked at 15:24 UTC to "make onboarding best-in-class" from the same repositories.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Issue reactions indicate what users of these tools want. | Public GitHub data. | A survey or interviews that disagree. |
| ADR 0023 holds an author on its candidate when quota runs out. | ADR 0023 decision 2. | The kernel change that builds ADR 0024 decision 6. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Builder and reviewer can say what each new file claims and which script produced each number.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
