# Basis: remove the example-package pack and its examples

**Change slug:** `remove-example-package`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-06
**Decision this basis supports:** whether Control Rod may drop the example-package pack, the drawing tool drawings pack and every example drawn from them.

## Mission / need

Owner instruction, 2026-11-06: Control Rod is a general multi-agent workbench for engineering teams and must not carry one business's content. Remove the capital-projects example-package pack and every trace of it and of the facility siting job it carried. A second instruction the same day removed drawing tool and the drawings pack too, since they existed only to draw the site plan. A third folded in a README example fix (closed PR #67).

## What changes

- Removed: `packs/capital-projects/` (the example-package pack, the drawings pack and the pack README), `tests/conformance/cad/`, and the change records `.nuclear/changes/mvp-example-package/` and `.nuclear/changes/drawing-engine-drawing tool/` (git history keeps them). The capital-projects mode in `spec/` stays.
- ADR 0018 is kept as a withdrawn record, stripped to its status and a one-line summary, so ADR numbering holds.
- Code that used the pack: `scripts/cr.mjs` no longer syncs the pack's Python environment or builds drawing tool (`setup-drawing tool` is gone); the intake and default tool lists in `services/api/src/work.ts` and the daemon's `DefaultClaudeTools` drop `Bash(cr-example:*)`, a tool that no longer exists; the web app's role-specific "Confirm boundary" accept label, whose only entry was a removed role, is gone.
- Tests that exercised job packs through the site pack (role tools with a network line, family and role pre-checks, pack templates shipped to agents) now use a neutral pump replacement fixture in `services/api/test/fixtures/packs/`, laid out under `packs/` in a temporary repository root by `rootWithFixturePacks()` in the test harness.
- Every sample request, fixture, scripted agent (`tests/e2e/fake/`) and doc example now uses neutral engineering work, such as "Draft a scope of work for the pump replacement".
- Historical records and specs that named the pack, its branch or drawing tool get a one-line removal note or a neutral rewording; frozen evidence logs are left as they are.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the packs and records are gone, nothing that used them breaks, no tracked file outside evidence logs names the removed subject, and the full suites pass on the merged tree.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
