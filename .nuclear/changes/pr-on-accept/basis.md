# Basis: Accepted work opens a draft pull request, and SCRAM is one press

**Change slug:** `pr-on-accept`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review. Stacked on `signing-policy` (PR #198).

## Mission / need

The owner, 2026-11-25: "I haven't had any card actually make it all the way through... I want this to be autonomous." The coordinator set the bar: a real small card on a public repository goes from creation to an open pull request with zero human steps. After `signing-policy`, Light releases and accepts routine cards on their own, but accepted work stayed on a local branch, and a card added from the board had no repository checkout and no lane, so it waited for a person twice.

On SCRAM, the owner asked that passkeys be kept for monumental actions. Stopping is always safe, and an emergency stop that waits for a passkey prompt is slower exactly when speed matters.

## Proposal

1. **Pull request on accept.** When a package whose request was bound to a repository checkout is accepted (by a person or by the Light policy), Control Rod commits what the author left in the worktree (never its own run folders), pushes the branch to `github.com/<repo>` with the owner's `gh` credential, and opens a **draft** pull request whose description names the card, its acceptance criteria and the blind check. Draft keeps the owner's merge as the check-in before anything lands. Each attempt is recorded as `package.pr-started` then `package.pr-opened` or `package.pr-not-opened`, once per revision, and the card shows the link or why there is none.
2. **Guards.** Only GitHub repositories, only the public and internal lanes (pushing discloses the work), never when the branch moved, never when the work changed nothing, and never when the repository's own config (local or worktree scope) sets `url.*`, `http.*`, `credential.*` or `include*` keys that could redirect the push or its credential. The push names its target URL rather than reading the checkout's remote.
3. **Quick add in a project** posts with the project's lane (chosen by the person when they made the project, and stated on the field), and in a project bound to a repository with the worktree strategy gives each card its own worktree and `cr/<words>-<tag>` branch. Outside a project nothing changes: the card waits for its lane (M-0).
4. **SCRAM pull is one press.** The pull needs a reason and no passkey; a passkey that comes with it is still verified against the exact pull and recorded. `ScramEvent.assertion` becomes optional and `scram.pulled` records `signed`. Review and restart stay signed.

## Out of scope

`kernel/`, `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`: untouched. Merging pull requests, retry on a failed push, and per-project switches for pull requests are later work.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card added from the board in a project bound to a GitHub repository gets its own worktree and branch and the project's lane. Once accepted, its work goes out as a draft pull request with no clicks, recorded as events and shown on the card. Restricted lanes, non-GitHub repositories, no-change work and repository configs that could redirect the push open nothing and say why. SCRAM stops with one press; restarting stays signed. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
