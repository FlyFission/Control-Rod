# Basis: A guided first run on the board

**Change slug:** `first-run-guide`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-24: "I don't even know where to go with this. This isn't intuitive at all. I'm getting stuck." A cloud walkthrough as a new user found the board opens with three ways to add work, twelve sidebar places, and no statement of the path from install to a first change landing, and that a card needs a project with a repository to reach a pull request without anything saying so.

## Proposal

A "Get your first change done" panel at the top of the board, modelled on the setup checklists in Linear and Vercel (pattern only): choose your agents, connect a repository, describe a change, approve the plan, review and accept. Each step is ticked from what the server and the person's settings already say (seated ready agents, a project with a repository, any card, any package past draft, any accepted package). Only the next step shows its one-line reason and one primary button (Setup, the project dialog, the new-change box, or open the waiting card). It closes when a change is accepted, and "Hide guide" hides it for that person on that browser. While it shows, the plain empty-board card is not shown, and that card's copy now says what happens: "Describe what you want done. An agent drafts a plan, and nothing runs until you approve it."

## Also: the live suites' scripted intake honors the board's mode

The walkthrough found that the scripted intake used by the live suites (`tests/e2e/fake/intake.sh`) always drafted Capital Projects packages, so a card added on the Software board vanished from it after intake, and the `@functional` lifecycle test failed on main. The script now reads the `[mode:...]` tag as the real intake role does (`packs/general/roles/intake.md`). The real intake already did; this fixes the test stand-in only.

## Also: the new-change dialog in plain words

"Capture work for intake" becomes "An agent turns this into a plan. Nothing runs until you approve it."; "Scope & acceptance criteria" becomes "What do you want done?" with a one-line example; "Capture settings" becomes "More settings"; the submit button says "Add change" (or deliverable, packet). With no repository chosen in Software mode it says so: "No repository chosen, so this ends in documents, not a pull request. Pick one under More settings."

## Out of scope

`spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. No new route or stored record: the hidden flag is browser storage.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new person on the board sees five steps from choosing agents to an accepted change, each ticked from real state, with one primary button for the next step only; the guide closes when a change is accepted or the person hides it. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
