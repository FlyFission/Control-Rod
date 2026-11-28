# Basis: Practice agent: watch the whole loop on a bundled sample, with no account

**Change slug:** `practice-agent`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review lists RM-1 (P0): a bundled, clearly labelled practice runtime with a sample project that walks the whole loop (intake, plan, release, author, pre-check, accept). Today a newcomer cannot see Control Rod work at all until they have a Claude or Codex subscription signed in on the machine. The practice run answers "can I see it work" in a few minutes, and doubles as a tour. The design is our own; no donor code is used.

## Proposal

1. Daemon: two practice runtimes, `practice` (intake and author) and `practice-check` (pre-check), in `adapter_practice.go`. Neither starts a process or runs a model: each role is a fixed Go routine that reads only the workspace's `inputs/`, writes only its `out/`, and narrates each step as events with a short pause, so the card can be watched. A practice run refuses a repository checkout and any role it does not do. They are offered unless `CONTROLROD_PRACTICE=0`. The standalone `controlrod check` refuses the practice checker and never picks it, and neither has a vendor family. The fake runtime keeps its `CONTROLROD_ALLOW_FAKE=1` gate.
2. Independence inside the rules: the kernel treats different providers as independent. The practice author and the practice checker are separate routines with separate providers that share no model, prompt or state, so a practice pre-check is independent with no owner override and no kernel or policy change. The control plane gives either one only practice-project work, so this independence never stands in for a real one. A practice check is not a counted check (no attestation), the same as the fake runtime.
3. API: the signed admin command `project.practice-start` (catalog `admin.project-create`, passkey required, as for any new project) makes the organization's one practice project, marked `practice: true`, on the practice agents, in the public lane, with no repository, and copies the bundled sample into Control Rod's own data folder (`~/.controlrod/practice/sample-project`). `POST /practice/cards` adds one practice card with the sample's files attached.
4. Guards (`practice.ts`): the claim offers a practice project's runs only to the practice agent for that role, and removes the practice agents from every other project's offer; `startRun` refuses a practice runtime on non-practice work as a last check. Project create and update, and capture tags, refuse a practice agent on a real project. The practice project refuses every setting change except its board lanes. A practice capture refuses a checkout, and a practice package run with a checkout is stopped, so no pull request can open.
5. Web: "Try a practice run" in Setup and in the first-run guide (until the first card), a Practice label on practice cards and captures, plain agent names, and a short note on the practice project's board.
6. `spec/`: additive fields only: `Project.practice`, `WorkspaceProject.practice`, `ExecutionTrace.runtime_mode` value `practice`, and the `POST /practice/cards` operation.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Independence through two practice providers, admitted only on the practice project | none: authoring agent's choice, open to the owner | 2026-11-28, chat | The kernel's provider rule is met as written; no kernel, policy or red-team change. | Any change to what counts as independent for real work. |
| D2 | Starting the practice run needs the passkey | none: authoring agent's choice, open to the owner | 2026-11-28, chat | It makes a project, and project creation is signed today. | A press-only start. |
| D3 | Practice runtimes are offered by default; `CONTROLROD_PRACTICE=0` turns them off | none: authoring agent's choice, open to the owner | 2026-11-28, chat | They need nothing installed and do nothing outside the practice project. | Offering the fake runtime. |
| D4 | A practice check is not counted and records no attestation | none: authoring agent's choice, open to the owner | 2026-11-28, chat | Same as the fake runtime; acceptance does not need an attestation. | Counted checks for real runtimes. |
| D5 | The practice project's release and accept follow its signing settings, which start at passkey for every step | none: authoring agent's choice, open to the owner | 2026-11-28, chat | No signing rule is weakened; the owner may choose a preset for it as for any project. | A practice-only signing shortcut. |

## Out of scope

Guided preparation and prepared release on the practice project (not tested; with those settings on, a practice run may hold like any other). A practice card for another mode or a second sample. Telling the board's no-agent notice that the practice agents are there.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a machine with no agent account, Try a practice run in Setup or in the first-run guide makes the practice project (signed with the passkey) and one card. The practice agents plan, author and pre-check it with no model and no process; the person releases and accepts with the passkey, and no pull request opens. The API refuses a practice agent on any other project and never gives one any other project's run. The fake runtime stays test-only. Daemon, API and web tests pass, and `pnpm spec` shows no drift.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
