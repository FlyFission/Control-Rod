# Basis: Interactive drag-and-drop workflow block flow editor & unified swim-lane packs

**Change slug:** `workflow-flow-editor`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** In progress (draft PR).

## Mission / need

Make the card/project "Workflow" setting an intuitive, modular drag-and-drop block flow editor built on the existing React Flow (`@xyflow/react`, MIT) diagram from PR #173, unifying workflow packs (Playbook, Superpowers, Pocock, Pocock Superpowers from PR #155), Light/Nuclear context-engineering packs (PR #108), imported upstream skill repos, and custom user packs into one swim-lane editor backed by a declarative, versioned workflow spec that the dispatcher actually executes.

## What already exists

- Workflow packs (`packs/workflows/`): Playbook, Superpowers, Pocock, Pocock Superpowers (PR #155), pinned by commit in `pins.json` and digest-checked in `lock.json` and `manifest.json`.
- Context-engineering pack (`packs/nuclear-grade/`): Light vs Nuclear context depth, digest-checked (PR #108).
- Block flow diagram & decision matrix (`apps/web/src/components/WorkflowDiagram.tsx`, `FlowCanvas.tsx`, `lib/councilFlow.ts`, `pages/Workflow.tsx`, PR #173).
- Council seats and fallback rules (ADR 0024): author seats fall back to the next agent (logged & flagged); blind checkers are independent of the author and never fall back.
- Casting Desk (open PR #170): role-to-model casting & effort configuration; we coordinate by reading council seats as defaults and never duplicating Casting Desk UI.

## Proposal

1. **Declarative, versioned workflow spec (`schema_version: "1.0.0"`)**: Pure validation, round-trip serialization, 3-way upstream lane merge, diffing, version history/rollback, and rule enforcement (author != blind checker, no checker fallback, Nuclear digest verification & modified-lane flagging).
2. **Backend API & real dispatcher execution**:
   - New migration `028-workflow-specs.ts` storing project/card workflow specs, custom packs, and lane version snapshots.
   - `/workflows/*` routes for catalog (built-in workflow + Light/Nuclear packs + custom packs), project/card spec GET/PUT, upstream repo URL import, custom pack create/export/import, on-demand/on-start update check + apply (with 3-way merge & conflict pause for forked lanes, no background timers), and rollback.
   - Dispatcher (`services/api/src/work.ts`) reads the saved declarative spec, executes the exact stage skills in order (combining Workflow × Context depth × agent assignment), enforces blind-checker independence and no-fallback, blocks if a required Nuclear pack fails to load, flags modified Nuclear lanes, and logs exact skill versions/commits/digests in `run.workflow` events on the card.
3. **Unified swim-lane React Flow editor (extending `WorkflowDiagram` / `FlowCanvas`)**:
   - Left-to-right stage row (`Brainstorm`, `Plan`, `Author`, `Check`, `Review`, `Ship`) with add/remove/reorder and explicit `"Coming soon"` markers on unbuilt automation steps.
   - Independent composable toggles: Workflow preset × Context depth (`Light` / `Nuclear`) × Check-in points × per-skill agent assignment.
   - Available agents tray (Claude, Codex, Antigravity, opencode, Grok, user models) with real logos; drag agent onto skill block or assign via keyboard menu; unassigned blocks fall back to stage council seat.
   - Swim lanes per pack (Superpowers, Pocock, Nuclear-Grade, imported URL repos, custom packs) with Fork, `"Modified from upstream"` badge + diff viewer, Auto-update vs Freeze (default `auto` for untouched, `freeze` for forked), conflict review UI, and reversible Rollback.
   - Full keyboard alternative and responsive 390px phone layout.

## Out of scope

- Trust surfaces untouched: `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `docs/adr/`, `spec/`.
- Casting Desk role-casting & model studio (open PR #170).
- Background polling/cron for skill updates (explicitly forbidden: on-start / on-demand only).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- All unit, integration, and round-trip tests pass for web and API.
- Editor round-trips losslessly to the declarative versioned spec.
- Dispatcher executes the saved spec, enforces blind-checker independence & Nuclear guarantees, and logs skill versions on the card.
- Visual bar passes desktop (1440px) and phone (390px) with ISA-101 control room styling.
- Independent blind review check is clean.
