# Basis: Scope drift and Plant bays use the files a patch changes

**Change slug:** `scope-from-patch`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

On a checkout card the author's outputs are `changes.patch` plus a reply such as `RESPONSE.md`, and the pull request is built from the patch alone. Two places used the output names as if they were repository files:

- **Scope drift** (`services/api/src/work.ts`, scopeDrift) compared output digests by name between rounds, so every fix round reported `changes.patch` and `RESPONSE.md` as changed outside the fix scope and never named the real files.
- **Plant bays** (`services/api/src/figures.ts`) placed a card by its output names, so a software card with no tag could land in the Docs bay because `RESPONSE.md` matches `**/*.md`.

Found by two independent repo-siphon reviews on 2026-11-28 (candidate C-001 of the review run on the owner's Mac, and noted in the cloud review's host baseline and in the Plant Map plan). Host-only fix; nothing taken from the donor.

## Proposal

1. New pure module `services/api/src/change-files.ts`. `patchFiles` and `changePatches` move there from work.ts (re-exported, so callers are unchanged). New functions:
   - `touchedFiles`: the files the chosen change patch touches, or the output names when there is no patch.
   - `patchSections`: a patch split per file (git and plain unified diffs).
   - `changedRepoFiles`: the files whose change differs between two rounds, compared per file of the patch, or by name and digest when there is no patch.
2. scopeDrift uses `changedRepoFiles`.
3. figures.ts takes paths from the outputs of the latest author run that has any, loading bytes only for patch files, through `touchedFiles`.

## Out of scope

`spec/`, `daemon/`, `kernel/`, `policies/`, `.github/`, `apps/web`: untouched. Lane presets and their patterns are unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
