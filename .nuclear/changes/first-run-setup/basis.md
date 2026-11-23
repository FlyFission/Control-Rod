# Basis: First-run setup and the Agents roster

**Change slug:** `first-run-setup`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether Control Rod may open on a setup page, record which agents are seated and when to check in, and leave benched agents out of dispatch.

## Mission / need

Ben's first real macOS install of main (2026-11-23) opened straight onto the board with no setup. The Roster showed Codex "not ready" while Settings > Subscriptions showed it installed and signed in, with nothing saying why. Explore showed disabled "Cycle 2" controls that could not be clicked. Adding a card failed at intake and left the card with no actions.

The onboarding design Ben approved (draft PR #150, `docs/patterns/onboarding.md`; ADR 0024 decision 7) asks for: the agents found, confirm or fix or add each, a read-back, and one question, "When should we check with you?", with the middle answer preselected.

## What changes

- **Intake brief.** The failed card was diagnosed read-only on the owner's machine: the intake agent wrote two drafts, and `finishIntake` refused both because the brief never asked for `title`, `design_inputs[].use` or `assumptions[].basis`/`statement`/`id`. `packs/general/roles/intake.md` now names exactly the contract's fields. A test fails if a required field goes unmentioned or a brief-shaped draft stops validating.
- **Setup record.** `GET/PUT /setup` and `PUT /setup/seats/{runtime}` (one roster switch) (spec/api.tsp, additive models `AgentSetupView`, `AgentSetupRequest`, `AgentSeat`, `CheckIn`). Stored install-wide in `settings` (like the daemon's runtime status), written by the new catalog command `setup.record` by an administrator (or the bootstrap Member of a single-organization install). Seat changes are appended to the event chain as `setup.seats-changed` with the member as actor; the check-in answer is a preference and stays off the chain.
- **Dispatch.** `claim` removes benched runtimes from the daemon's offer, reading seats under the dispatch lock that seat writes also take. Removing a runtime can only make work wait; `pickChecker` still refuses the author's runtime, so independence is unchanged. No kernel decision function, policy or spec major version is touched. The spec change is additive (new models and routes, no changed or removed field), so it is a minor version; the owner decides whether it needs his recorded yes.
- **Web.** A Setup page (agents found, one switch each, Add an agent, the check-in question, the read-back, Looks right / Change / Skip for now). The app opens on it until setup is confirmed; Skip holds for one browser session. The Agents roster replaces Roster and Subscriptions in the nav: the same rows with switches that save at once, and the old tables under Advanced. Explore becomes Snapshots without the unbuilt fan-out controls. The nav group "Control" becomes "Control / Setup".
- **Check-in answers.** Stored now. Only "At the start and before merge" matches today's stops; the other two say so on the page. Making them change stops is a kernel change that needs the owner's signature (ADR 0024).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
