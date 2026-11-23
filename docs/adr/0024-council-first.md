# ADR 0024: Council first, simple by default

- Status: Accepted by the owner for decisions 1 to 5 on 2026-11-23. Decision 6 is Proposed and waits for the owner.
- Date: 2026-11-23
- Relates to: ADR 0019 (own workbench), ADR 0023 (role casting). Decision 6 would amend ADR 0023 decision 2 for author roles only.

## Context

The owner's goal, in his words (2026-11-22): "the easiest way to have a council of agents (AGY, Codex, Claude, Grok, opencode, mistral, etc.) at the table and at various instances with super flexible and dynamic workflows." He also said the product feels too complicated and should feel minimal, with complexity hidden.

Two scripted studies, both under `docs/research/user-demand-2026-11/`, test that goal against what users ask for. Every number below comes from those scripts and their recorded inputs (AGENTS rule 5).

- **Persona model.** 20 archetypes weighted to 100 people, mapped to 14 needs (`personas/`). The top need by score is knowing a result is right before merging: 46 of 100 put it in their top three. The widest need is using the subscriptions people already pay for, with visible limits: 71 of 100 name it at all. Plain language for people who do not live in git is a top-three need for 30. The weights are judgment and are recorded so they can be changed and re-run.
- **Issue demand across 15 related repositories.** 29,938 issues and 64,750 pull requests (`repos/`). Of the 60 most-reacted issues, the largest group asks to bring any model or agent to the table, with fallback: 9 issues, 348 reactions, about twice the next group. The next groups are reaching the same agents from anywhere (6 issues, 174 reactions) and making the tool simpler, with an off switch (6 issues, 173 reactions). None of the 60 asks for review, diff or verification features. In the keyword pass, config and control is a top-three feature-request theme in 8 of 15 repositories, the most of any theme.

Issue writers are mostly power users and the persona model is modeled, not interviewed. Read both as direction, not as a precise ranking.

## Decision

1. **The table is the product.** Control Rod leads with seating the agents people already use, each in a role, at one table. The README pitch ("Put your coding agents at one table") already says this. Adding a seat stays a file and tests: an adapter kit for any CLI, a local endpoint or a hosted router, named by the user.
2. **The blind checker is a seat, on by default.** It stays the default and stays blind, as today. It is the strongest need in the persona model, but users of these tools do not ask for it in issues, so it is not the whole pitch.
3. **Simple by default.** The first screen is a Planner box, the board in three groups (Needs you, Working, Done), and one window per task, with a short checklist and an abridged history that opens to the full transcript. Everything else moves behind Advanced and keeps being recorded. Labels are plain by default; the plant vocabulary becomes a theme.
4. **One usage gauge across subscriptions.** Each seat shows its remaining limit where its CLI reports one and "not reported" where it does not. It never guesses and never suggests buying more. A short spike first finds which CLIs report remaining quota.
5. **Reach the table from anywhere, sooner.** Remote daemons over SSH stay in the plan and move earlier. Phone approvals are no longer "later"; they follow release 1.

## Proposed, waiting for the owner

6. **Author seats may fail over.** When an author candidate is out of quota, signed out or not installed, the run may move to the next candidate on the casting sheet, and the run record says why. Check and refute roles never fail over, so ADR 0023's guard against shopping for a pass is unchanged. This amends ADR 0023 decision 2 ("budget and quota hold the run on that candidate and never move it down the list") for author roles only. If accepted, the kernel and policy parts need the owner's signature as usual.

## Consequences

- The plan's release order should put the adapter kit, more runnable seats and the usage-gauge spike ahead of features users do not ask for. Review UI and notifications stay table stakes, adopted from proven patterns, not differentiators.
- A spike checks whether live terminals can run on an existing Apache-2.0 terminal runtime (herdr, `docs/patterns/herdr.md`) instead of a terminal layer of our own. ADR 0019 stays in force; the spike reports, and a separate decision follows.
- Nothing in this ADR changes a trust surface. Decision 6, if accepted, will.

## Alternatives considered

- **Lead with the blind checker alone.** Rejected as the whole pitch: it is the top persona need, but it is absent from the 60 most-reacted issues.
- **Match competitors feature for feature.** Rejected: the most widespread ask in the same issues is for less, not more.
- **Fail over every role.** Rejected: a checker that moves down the list on failure invites shopping for a pass (ADR 0023).
