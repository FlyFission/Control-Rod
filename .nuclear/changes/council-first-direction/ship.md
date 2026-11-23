# Ship: Council-first direction

**Change slug:** `council-first-direction`
**Owner:** Ben Huffer
**Date:** 2026-11-23

---

## Release identity

- **Branch:** `claude/project-thread-c8npg3`
- **Intended release window:** after the owner reads ADR 0024.

## Scope and exclusions

- **Included:** ADR 0024, the research folder, the herdr and onboarding pattern notes, index lines.
- **Excluded:** `README.md`, `docs/status.md`, `docs/plan/`, any code. Reordering the plan to match ADR 0024 is a follow-up.

## Evidence status summary

| Area | Status | Link |
|---|---|---|
| Numbers from scripts | pass | E-001 |
| Public claims and originality | pass | E-002, E-003 |
| Trust surfaces | none edited | E-005 |
| Owner read | pending | E-004 |
| Owner's recorded yes for `docs/adr/` | pending | E-006, Signature below |

## Residual risks and gaps

| Risk or gap | Owner | Recheck trigger |
|---|---|---|
| The persona weights and top 60 codes are the agent's judgment. | Ben Huffer | Any user interviews or a survey. |
| Building decisions 6 and 7 needs kernel and policy changes with the owner's signature. | Ben Huffer | The first build PR for either. |
| The herdr build-on question is open until a spike. | Ben Huffer | The spike's report. |

## Rollback / restore plan

Revert the commit.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| Change-record validation in CI | Passes | Ben Huffer | GitHub Actions | Fix the record |

## Release decision

- **Decision:** merge only after the owner's recorded yes is in the Signature table, CI is green and the blind re-check passes. Until then ADR 0024 stays Proposed.
- **Decision maker:** Ben Huffer.
- **Rationale:** documentation only and reversible, but `docs/adr/` is a CODEOWNERS path.

## Signature

| Field | Entry |
|---|---|
| Decision | Pending: approve pull request #150, which adds ADR 0024 under `docs/adr/`, and mark ADR 0024 Accepted |
| Question | Not yet asked |
| Answer | Not yet given |
| Head when asked | Not yet asked |
| Recorded by | To be filled by an agent from the owner's own words. No signature or initials are typed for him |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- The merge decision is stated plainly.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
