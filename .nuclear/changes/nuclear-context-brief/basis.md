# Basis: Nuclear context in agent briefs

**Change slug:** `nuclear-context-brief`
**Related risk record:** `risk.md`
**Date:** 2026-11-21
**Decision this basis supports:** whether the control plane's brief builder may add the nuclear-grade pack's cards to author and pre-check briefs when a card's context profile is Nuclear.

## Need

BRIEF.md is the only instruction an agent gets. A card can run under a Light or Nuclear context profile (contract shared with the parallel spec and pack work: optional `context_profile` on the package body, `default_context_profile` on the project, the pack at `packs/nuclear-grade/` with `manifest.json`). Nuclear work must carry the pack's Core card and the cluster cards its facts select; Light work must not change at all.

## Design

`services/api/src/context-profile.ts` resolves the profile (Safety and Material grade lock Nuclear), selects clusters from structured facts only (role tools, deliverable types, rigor mode, grade, an optional `nuclear_clusters` hint), and builds the brief sections. Cards go inline; full skills ship as `inputs/reference/<skill>/SKILL.md` and templates as `inputs/templates/<mode>/`. `buildJob` calls it for author and pre-check, not intake, and inserts the sections before Rules. A Nuclear run records a `run.context-profile` event naming profile, lock, reason, clusters and pack commit.

## Not done

The trust-surface path rule is not applied: the WorkPackage contract has no path scope (deliverables carry id, type and formats; interfaces name parameters). `TRUST_SURFACE_PATHS` documents the list for when spec/ adds one.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
