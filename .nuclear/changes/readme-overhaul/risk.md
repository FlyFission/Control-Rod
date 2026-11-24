# Risk: README overhaul

**Purpose:** Name what this change could get wrong and the least evidence needed before it merges.

**Change slug:** `readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Lifecycle phase:** Verify
**Status:** Ready for owner review.

---

## Mission anchor

- **Objective:** the README is the project's front page; it describes the product as it is on `main` today (a board-first workspace where agents from different vendors author and check, and a person signs off), in fewer words, with a current screenshot.
- **Success criterion (done when):** every capability the README states as present is on `main`; unmerged work is not described as shipped; the public-claims and originality checks pass; the screenshot comes from the release build through `readme-shots.spec.ts`.
- **Non-goals:** describing open pull requests (#134 to #148) as shipped, a Planner screen, a cross-subscription usage gauge, any app change.

## Risk class

Low. Documentation and one screenshot spec. No contract, kernel, policy, workflow or runtime behaviour changes.

## Selected mode

- **Mode:** Standard
- Basis: low risk (documentation and a screenshot spec only, no trust surface), recorded in the standard set so each front-page claim has a trace row.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| What could this quietly get wrong? | Overstating what runs: Antigravity, OpenCode, Grok CLI and Ollama are registered but refused until confined (`wave2-multi-cli-adapters`). The README says so. |
| Could it collide with open work? | No open pull request touches `README.md` or `docs/assets/readme/` (checked against #117 and #134 to #148 by diff). `docs/status.md` is touched by #135, #143 and #148, so it is left alone. |
| Does a fixture name a real person's setup? | The board fixture adds generic software cards only. The existing `ben` session user in the spec is unchanged. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Each claim in `trace.md` has a status.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
