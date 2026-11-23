# Ship: README overhaul

**Change slug:** `readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-23

---

## Release identity

- **Branch:** `claude/project-thread-thvi8k`
- **Intended release window:** after #135, #136 and #137 land, rebased onto them.

## Scope and exclusions

- **Included:** `README.md`, the board screenshot and its spec step, retaken pictures.
- **Excluded:** `docs/status.md` (open pull requests touch it), the docs index, any app change.

## Evidence status summary

| Area | Status | Link |
|---|---|---|
| Claims against `main` | pass (author read) | `verification.md` E-004 |
| Public claims and originality | pass | E-002, E-003 |
| Pictures | pass; the `readme-shots` workflow retook them on the branch (5cb64d1) | E-001 |
| Trust surfaces | none edited | E-005 |

## Residual risks and gaps

| Risk or gap | Owner | Recheck trigger |
|---|---|---|
| The README goes stale as open pull requests land (`controlrod check`, update panel, more runnable agents). | Ben Huffer | Each merge of #135, #136, #137 or an adapter qualification. |
| The `readme-shots` workflow will run on this pull request because the spec changed. | Ben Huffer | Its first run on this branch. |

## Rollback / restore plan

Revert the commit.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| README on GitHub | Pictures load; links resolve | Ben Huffer | The repository front page | Fix forward |
| `readme-shots` run on this branch | Passes and pushes only PNGs | Ben Huffer | GitHub Actions | Fix the spec |

## Release decision

- **Decision:** merge after the owner reads it and CI is green.
- **Decision maker:** Ben Huffer.
- **Rationale:** documentation only, reversible, no trust surface edited.
- **Owner read (E-004):** Ben Huffer read the README on the pull request and approved working toward merge on 2026-11-23 ("I love it. Work towards a merge."). Merge follows a clean Codex review of the final head and green CI.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- The merge decision is stated plainly.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
