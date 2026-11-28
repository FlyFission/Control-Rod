# Basis: visual reference board

**Change slug:** `visual-reference-board`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24

## Mission / need

Three visual rounds on the Plant view (#153 twice, then #165) ended at about the same look. A review on 2026-11-24 found that no round had a picture or a measurable bar to build against: the briefs were adjectives, and code review stood in for a visual check. The owner asked for an objective set of 5 to 10 references, chosen from evidence, and for it to live in the repository so every agent builds against it.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Pick the references from evidence, not his taste | "We can probably find an objectively best 5 to 10 that have similar gravitas and are known for looking amazing and feeling great. I'm not sure you want me making that call. There's probably an objectively best set of fits" | 2026-11-24, 00:26 UTC, project chat | Choose 5 to 10 references by award and review evidence and keep them in the repository. | Any code, style or test change. |
| D2 | Work carefully | "Let's be just more meticulous and systematic and thorough" | 2026-11-24, 00:14 UTC, project chat | Each reference carries its evidence and source, and each screen gets a pass or fail bar. | Any change outside the reference board. |

## Scope

In scope: `design/references/README.md` (the references, how they were chosen, and their evidence), `design/references/screens.md` (the pass or fail bar per screen and state), one line in `AGENTS.md` pointing to them, and this record.

Out of scope: any code, style or test change; screenshots of third-party products, which belong to their owners and are linked instead.

## Fixed inputs

Award pages opened on 2026-11-24 and cited in `design/references/README.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

The board names 5 to 10 references, each with its award evidence and source, and gives a pass or fail bar for every main screen and state. The owner keeps the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
