# Basis: Agents write so a person can act at a glance

**Change slug:** `focus-writing`
**Owner:** Ben Huffer
**Date:** 2026-11-26
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-26, asked for the ideas in i-have-adhd (an MIT skill that makes coding agents lead with the next action, number steps and drop preamble) to be built into Control Rod everywhere. The Calm UI rule already shapes the screens; the prose agents write on a card (intake answers, the opening of a deliverable, RESPONSE.md, finding text) was still in each agent's own style, so a long answer could bury what to do next.

## Proposal

1. `services/api/src/brief.ts` FOCUS_WRITING: the upstream ten rules, rewritten for agents on a card. It shapes prose only: required files, sections and JSON fields are unchanged, and nothing the work needs may be dropped. Time is given only from something measured, so the rule never asks a model to type a number.
2. `composeBrief` and the intake brief add it before the rules unless the install's writing preference is Standard.
3. `setup.ts` keeps the preference beside the check-in answer (`writing`: focus, the default, or standard), off the chain. `spec/api.tsp` gains the optional request field and the view field (additive).
4. Setup gets one small section, "How should agents write to you?", read back with the rest.
5. `packs/nuclear-grade/budgets.json` re-measured with `scripts/measure-briefs.mjs` (Light 338 to 784 tokens).

The screens follow the same rules in a separate change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under the Focus writing preference, which is the default, every intake, author and pre-check brief carries one section, placed just before the rules, that tells the agent to write what a person reads with the outcome or next action first, numbered steps, one next step at the end, short lists and no preamble, without dropping anything the work needs. Setup has a "How should agents write to you?" choice (Focus or Standard) that is saved like the check-in answer and stays off the chain. Standard leaves the section out. The brief budgets are measured again by script. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): its ten output rules and its first-and-last-line check, rewritten for agents on a card. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
