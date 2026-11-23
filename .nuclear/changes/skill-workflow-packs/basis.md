# Basis: skill workflow packs (Superpowers, Pocock, Pocock Superpowers)

**Change slug:** `skill-workflow-packs`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-22
**Decision this basis supports:** whether Control Rod may ship the Superpowers and Matt Pocock workflows, and their hybrid, as per-package workflows, including two optional `spec/` fields.

## Mission / need

The design is `docs/patterns/skill-workflows.md` (change record `skill-workflow-patterns`, pull request #147). The owner asked for it built in full, with a note in the repository that does the two workflows justice (`docs/patterns/ode-to-two-workflows.md`), using subagent-driven development across Claude and Codex.

## Design

- **Contract.** Optional `WorkPackage.workflow` and `Project.default_workflow` (`playbook` | `superpowers` | `pocock` | `pocock-superpowers`), regenerated; migration 026 makes the project default administrator-mutable. The capture carries the choice as a `[workflow:<id>]` line written by New work, as it already carries `[mode:...]` and `[workspace:...]`; no Capture field.
- **Packs.** `packs/workflows/superpowers/` and `packs/workflows/pocock/` are generated from pinned upstream commits (`pins.json`) by `scripts/generate-workflow-packs.mjs`: every upstream skill's Markdown, byte for byte, the `LICENSE`, and a manifest of digests; `--check` fails on hand edits. `workflow.json` and `stages/<role>.md` are Control Rod's own. The hybrid holds only its map and cards and references the two packs.
- **Composer.** A package's workflow resolves from the card, then the project default, then the playbook; intake's from the capture's tag. The stage card goes into the intake, author or pre-check brief before any Nuclear sections; the upstream skills the stage names ship as `inputs/workflow/<pack>/<skill>/...` after a digest check. A run whose pack is missing or fails its checks fails while queued. An agent never picks a workflow: intake drafts take the capture's.
- **Sections become packages.** Plan tasks and tickets are packages chained by the existing `depends_on`, so each section gets its own author run and its own independent pre-check, as ADR 0023 requires. No control-plane change.
- **Sync.** `scripts/sync-workflow-packs.mjs` regenerates a pack from a newer checkout and reports skills added, changed, renamed or removed and stage skills that no longer resolve; a person reads it before merge.
- **Board.** A Workflow control beside the Context switch, a project default in Administration, and the choice in New work.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Build the workflows out in full. | "build out them until they are full though." | 2026-11-22, Orchestrator.inc worker session control-rod-16, in reply to draft pull request #147 | Contract, packs, generator and check, composer, board controls, sync script and tests, in one change. | Merging; the `spec/` signature, asked separately. |
| D2 | Put a note in the repository that does the two workflows justice. | "Make sure there is a nice note in repo" | 2026-11-22, same message, which titles it "ode to two of my favorite workflows" | `docs/patterns/ode-to-two-workflows.md` in the owner's voice, crediting both authors. | A personal anecdote, which the owner has not supplied. |
| D3 | Build with subagents across Claude and Codex. | "Sure do subagent driven to you and codex.  THat's fine. execute." | 2026-11-22, same message | The controller writes the contract and cards, delegates the scripts to Codex and the API and web work to Claude subagents, and reviews everything before it ships. | Letting any builder's pass stand without the controller's review. |
| D4 | Carry the `[workflow:<id>]` choice on the capture as a tag line, not a new Capture field. | none: authoring agent's choice, open to the owner | 2026-11-22, same session | Keeps the `spec/` change to two optional fields, like #108. | nothing beyond the tag line |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Both upstreams are MIT at the pins. | Their `LICENSE` files and GitHub license metadata. | A file to be shipped carries another license. |
| #117 keeps the composer's role structure. | Its description on 2026-11-22. | #117 merges first with a different composer; this change rebases onto it. |
| The display name "Pocock Superpowers" is a working name. | Owner's words in `skill-workflow-patterns` D3. | Either author objects; the label changes before release. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A package can run under the playbook, Superpowers, Pocock or Pocock Superpowers workflow, chosen per card with a project default and in New work, separate from its context profile. The two upstream packs are generated from pinned commits with digests and a `--check`; the composer puts the right stage card in the intake, author and pre-check briefs and ships the named upstream skills as verified inputs; a run whose pack is missing or tampered never starts; a sync script reports every upstream change for a person to read. Playbook briefs are byte for byte unchanged. The owner's recorded yes for the two `spec/` fields is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
