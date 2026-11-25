# Basis: v0.1.0 first release

**Change slug:** `r3-v0-1-0`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** cutting the first release from the defaults the owner accepted, without writing `.github/workflows/release.yml`.

## Mission / need

Phase 3 of the ten-x amendment program closes the distribution gap: one non-release tag, zero GitHub releases. The owner accepted the defaults named for the version string and the macOS row, and left the release-workflow yes unanswered. The release can be cut with `gh` on a green main. The workflow stays a proposal.

## Scope

In scope:
- `tools/release_notes.py`: a Quick record with no `basis.md` takes the first heading of `risk.md` instead of aborting the notes.
- `tools/test_release_notes.py`: that fallback.
- `release-notes.md` in this record: the script's output, committed before the tag.
- The annotated tag `v0.1.0` and the GitHub release, cut after this commit is on green main. Not files in this commit.

Out of scope:
- `.github/workflows/release.yml` (trust surface; the recorded yes was not given).
- A live macOS start (the owner skipped the check; the row stays "not yet verified live").
- Phone approvals and remote daemons (ADR 0024 decision 5; not in this tag).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Take the defaults named for the version and the macOS row | "Take the defaults." | 2026-11-24, chat session, in reply to the defaults named in that session | Version string `v0.1.0`, the name the plan already used. Notes range: every change record added since `phase0-before-rebase`, the only tag. macOS: plan option (b), the README row stays "not yet verified live" and the release notes repeat it. The release is cut with `gh`, not by writing the workflow. | The recorded yes for `.github/workflows/release.yml`. Phases 4–7. A live macOS run. |

## Rulings (authoring agent)

| # | Ruling | Authority | Cost if wrong |
|---|---|---|---|
| A-1 | `phase0-before-rebase` has no merge-base with main, so `--from` that tag lists every titled record on main, not a post-rebase slice. | `git merge-base phase0-before-rebase origin/main` prints no merge-base. The owner's accepted range was "since the only tag." | The notes are the whole history. A reader who expected only post-rebase work sees older records too. The list is still every record the range contains. |
| A-2 | A record with no `basis.md` takes the first heading of `risk.md`. | The four directories the script would have dropped (`ao-daemon-lock-probe`, `ao-probe-runs-artifact`, `headroom-patterns`, `xerj-patterns-and-timeout-guard`) are Quick records whose `risk.md` and `proof.md` carry the title. Reviewer feedback named the first of these; the other three were checked the same way. | A Quick record whose title lives only in `proof.md` would still be skipped. These four do not. |

## Fixed inputs

1. The ten-x amendment plan, Phase 3, and the defaults stated in the 2026-11-24 chat before "Take the defaults."
2. ADR 0024 decision 5: remote daemons stay planned; phone approvals follow release 1. This tag must not promise either.
3. README platform row: macOS app "Expected to work, not yet verified live."

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The only tag is `phase0-before-rebase`, and it is not on main's history. | `git tag -l` and `git merge-base` against `origin/main` at `e1410497`. | A release tag appearing before this one is cut. Then the notes range is wrong and must be regenerated before tagging. |

## Open questions for Ben

1. The recorded yes to land `proposed-release-workflow.yml` as `.github/workflows/release.yml`. Not required to cut this release.

## Verification limits

- The notes file is the script's output for one range at one main commit. It is not a curated changelog.
- The tag and the GitHub release are cut after merge. This packet's verification of those steps is filled in `verification.md` when they happen.
- Fresh-clone verification (plan Step 5) runs after the tag exists.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The owner-accepted defaults are recorded: `v0.1.0`, notes since `phase0-before-rebase`, macOS row unchanged.
2. `release-notes.md` is the script's output for that range, including Quick records via `risk.md`, and the tests pass.
3. The annotated tag and GitHub release exist only after this commit's main ci run is green, with that run's SBOM attached.
4. The release does not promise phone approvals, remote daemons, or a verified macOS start.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
