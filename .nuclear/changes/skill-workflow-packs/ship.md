# Ship: skill workflow packs

Release decision: **the `spec/` change waits for the owner's recorded yes (see Signature); merge waits on the owner's ask to merge; no release is authorized by this record.** The change touches `spec/`, a trust surface (AGENTS.md rule 2), signed under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

- **Proposed:** merge the contract, packs, generator and sync, composer, board controls and the ode together on the owner's yes, after #147 (this pull request is stacked on it).
- **Not claimed:** a real agent run under any workflow (all briefs and inputs were composed and tested, none were sent to a model); a browser pass of the new controls (jsdom only); that the brief sizes equal any model's tokenizer; a person's read of the stage cards against the upstream skills; that either author has seen the hybrid's name.
- **Known:** one flaky API timeout (E-02); the two register problems already on `main` (E-05); #117 reworks the same composer and Shell, so whichever merges second rebases.
- **Upstream sync:** run `node scripts/sync-workflow-packs.mjs --pack <id> --from <fresh checkout> --report <file>` about every two weeks, read the report and diff, and open a pull request with its own record. Nothing merges automatically.

Rollback: revert the merge. Migration 026 has a down-SQL; the two `spec/` fields are optional, so packages and projects that carry them read as before once reverted.

Monitoring after merge: run one small request under each workflow and read the briefs (`run.workflow` events name the workflow and pack commits); confirm the playbook brief is unchanged and that an intake under Pocock or Superpowers drafts its final package with every ticket in `design_inputs`.

## Signature

| Field | Entry |
|---|---|
| Decision | Pending: the two optional `spec/` fields (`WorkPackage.workflow`, `Project.default_workflow`) |
| Question | To be asked in the session chat, naming the pull request |
| Answer | Not yet given |
| Head when asked | To be recorded |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A package can run under the playbook, Superpowers, Pocock or Pocock Superpowers workflow, chosen per card with a project default and in New work, separate from its context profile. The two upstream packs are generated from pinned commits with digests and a `--check`; the composer puts the right stage card in the intake, author and pre-check briefs and ships the named upstream skills as verified inputs; a run whose pack is missing or tampered never starts; a sync script reports every upstream change for a person to read. Playbook briefs are byte for byte unchanged. The owner's recorded yes for the two `spec/` fields is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
