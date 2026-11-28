# Basis: Make every button and option work, or hide it until it does

**Change slug:** `dead-buttons`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review (batch 4) found controls in the web app that did nothing, or did less than they said. The rule for this change: every control either works or is hidden until it works. A feature is finished when the fix is contained. Otherwise it is hidden, with a code comment and a logged follow-up. The design is our own; no donor code is used.

## Proposal

1. API-1. A run can only be bound to a linked git worktree, so a fresh clone or a branch in the main clone always failed at bind. Binding them safely needs `--separate-git-dir` and daemon custody work, so they are hidden: New Work and the project form no longer offer a strategy, saved defaults and projects read as worktree, and bindCheckout refuses the others in plain words. Follow-up logged in the bindCheckout comment.
2. WEB-4. New Work bound a repository only when the person pressed Prepare. Add now prepares the worktree itself, binds the card to it, and removes the worktree if the capture is refused.
3. WEB-5. A capture from the capture box carried no project tag, so the Board's scope hid it. It now carries the open project's mode and id.
4. WEB-3 and API-8 (#175). The reasoning selector was cosmetic. In order: the spec gains an optional Job field `reasoning_effort` and a claim flag `supports_reasoning_effort` (additive); the daemon declares the flag and maps the level to each CLI's real flag (Claude Code `--effort`, Codex `-c model_reasoning_effort`), adding nothing for a level a CLI does not list; the API sends the level only to a daemon that declares the flag, so an older daemon never sees a field it would refuse (DMN-4).
5. WEB-6. Compare showed only two revisions' headers. It is removed until it can line their deliverables up.
6. WEB-11. Saved agent defaults were ignored. A saved default now records which agents were picked, and those reach new cards.
7. WEB-12. Quick add prepared only for worktree projects. It now prepares for any project with a repository.
8. WEB-13. Setup said "Create a project first" with no way to do it. It now has a New project button.
9. WEB-14. Two of three check-in choices said Coming soon and did nothing. Only the built choice shows; a saved unbuilt choice reads and saves as the built one.
10. WEB-8. SCRAM linked away to /office and took three steps. The SCRAM switch now opens the stop dialog in place: one press opens it, one press of Stop now fires it.
11. WEB-2. The Board's New change button clicked a header button found by query. It now opens New Work through a shell context.
12. WEB-7 (#206) was already fixed on this branch in commit ec47ca2.

## Out of scope

Binding fresh-clone and branch checkouts (follow-up). A real Compare view. Other check-in points.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each control in review batch 4 either does what it says or is gone. New Work and Quick add bind every card with a repository to its own worktree, preparing it on Add when needed. A capture from the capture box shows on the open project's Board. The chosen reasoning level reaches Claude Code as `--effort` and Codex as `model_reasoning_effort`, and only a daemon that says it reads the field gets it. Saved agents reach new cards. Setup offers only built check-in points and a button to make a project. SCRAM opens its confirm on the same screen. Compare is removed. Web, API and daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
