# Basis: show Claude Code and Codex in the control room from the start

**Change slug:** `control-room-claude-card`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** In build.

## Mission / need

After installing the control room (`control-room-usage`), the owner opened it and did not see Claude Code. Claude Code reports its limits only inside a run's `stream-json` output, so before Control Rod's first Claude run there is no reading, and the module listed Claude only in a quiet "not reported" line. A built-in harness should be visible from the first launch, with whether it was found and signed in and when its numbers will arrive.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Claude must be visible in the control room. | "I don't see Claude in the control room." | 2026-11-24, project chat | Claude Code and Codex always get a card. With no reading, the card says found or not, signed in or not (from the existing `/subscriptions` probe), and when the numbers fill in. | Reading Claude's limits any other way (ADR 0021, ADR 0025); spending a Claude message to probe. |

## Exit criteria

Claude Code and Codex each show a card on a fresh install; a card with no reading has no bar and says whether the CLI was found and signed in; they leave the "not reported" line; the web suite and the axe scan pass.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
