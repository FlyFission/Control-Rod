# Plan: program gap analysis

1. Read the repository as built: every web place, the board code and tests, the API client surface, the daemon's runtime support, the plans, the status page, CI, and the open pull requests and issues.
2. Read the repository's own competitive research and review synthesis from the board redesign record.
3. Read the public READMEs of Multica and Munder Difflin and two third-party roundups on 2026-11-08; record the date on each claim.
4. Write the gap analysis: the field in one table, a SWOT, a capability matrix with a disposition per row, ranked end-user gaps with a trust constraint each, program gaps, the features to keep refusing, a roadmap and the owner decisions requested.
4a. Write the adoption and retention analysis (owner's 2026-11-08 follow-up): personas, the funnel from hearing about it to uninstalling, a countermeasure per failure, the questions nobody has asked, and the five moves.
5. Fix the one program gap that needs no decision: regenerate `docs/commands/inventory.md` and remove the rough-edge line from `status.md`; point `status.md` and `docs/README.md` at the analysis.
6. Owner reads the analysis and answers or defers the four decisions in section 8. Done when recorded in `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The analysis documents are complete, the sources it rests on are cited with their dates, the owner has read it and answered or deferred its four requested decisions. No product code is part of this change beyond the command inventory regeneration and the status page; no claim is made about any competitor beyond what its public README or the cited research said on the date given.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
