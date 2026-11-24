# Plan: skill workflow packs

1. Controller: the two optional `spec/` fields, regenerated; the workflow maps and stage cards; the ode, notices and register rows.
2. In parallel, in separate worktrees: Codex writes the generator, `--check`, sync script and tests, and generates the real packs; a Claude subagent wires the API composer, migration, admin and tests; a Claude subagent builds the board, New work and Administration controls and tests.
3. Controller: merge, review every diff against the design and the cards, add the real-pack tests, rerun every suite, measure budgets, fix what the review finds.
4. Ask the owner for the `spec/` yes, naming the pull request; record it.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A package can run under the playbook, Superpowers, Pocock or Pocock Superpowers workflow, chosen per card with a project default and in New work, separate from its context profile. The two upstream packs are generated from pinned commits with digests and a `--check`; the composer puts the right stage card in the intake, author and pre-check briefs and ships the named upstream skills as verified inputs; a run whose pack is missing or tampered never starts; a sync script reports every upstream change for a person to read. Playbook briefs are byte for byte unchanged. The owner's recorded yes for the two `spec/` fields is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
