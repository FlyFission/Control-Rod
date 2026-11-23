# Trace: skill workflow packs

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| SWP-01 A package carries one workflow (card, else project default, else playbook), separate from its context profile; intake takes the request's tag, else the default of the project its tag line names, and its drafts take the same; an agent never picks one. | `spec/records.tsp`, `spec/tenancy.tsp` (regenerated); `services/api/src/workflow.ts` `resolveWorkflow`, `captureWorkflow`; intake import in `work.ts`; migration 026; `admin.ts`, `tenancy.ts` | `test/workflow.test.ts` (25), `test/workflow-brief.test.ts` (9, incl. intake stamping and agent value removed), `test/admin.test.ts`, `test/draft-cas.test.ts` | implemented and tested |
| SWP-02 The two upstream packs are generated from the pinned commits' own Git trees (never the working tree), byte for byte, with digests and a `--check` that fails on hand edits. | `scripts/generate-workflow-packs.mjs`, `packs/workflows/pins.json`, `packs/workflows/{superpowers,pocock}/`, `third_party/licenses/` | `scripts/test/workflow-packs.test.mjs`; controller regeneration identical; `verify-packs.py` 65 and 50 files identical to upstream | implemented and tested |
| SWP-03 Each stage's card goes in the brief and every upstream file the card names ships as a verified input; the hybrid ships from both packs. | `workflow.ts` `loadWorkflowPacks`, `workflowBriefSections`; `brief.ts`; `packs/workflows/*/stages/` | `test/workflow-real-pack.test.ts` (12; mutation-checked: a card naming an unshipped file fails) | implemented and tested |
| SWP-04 A run whose pack is missing, or whose upstream files, manifest, workflow map or stage cards differ from their recorded digests (manifest, then `lock.json`), never starts; the choice is recorded on the run. | `blockedByWorkflowPack`, `workflowContext`, `run.workflow` event | `test/workflow-brief.test.ts`; tampered real copy refused in `workflow-real-pack.test.ts` | implemented and tested |
| SWP-04a Upstream skills that reproduce third-party material under another licence are not shipped, and each exclusion carries its reason. | `packs/workflows/pins.json` `exclude`, manifest `excluded` | `workflow-packs.test.mjs` exclusion test; `verify-packs.py` (no excluded file shipped) | implemented and tested |
| SWP-05 Playbook briefs are byte for byte unchanged; Nuclear budgets still hold. | `composeBrief` | `test/workflow-brief.test.ts`; `measure-briefs.mjs --check` (token counts unchanged) | implemented and tested |
| SWP-06 Workflow stage sizes are measured by script and checked. | `scripts/measure-workflow-briefs.mjs`, `packs/workflows/budgets.json` | `scripts/test/measure-workflow-briefs.test.mjs` | implemented and tested |
| SWP-07 A sync reports every upstream change for a person to read, and flags stage skills that no longer resolve. | `scripts/sync-workflow-packs.mjs` | `scripts/test/workflow-packs.test.mjs` (add, remove, rename by both rules, line counts, exit 2) | implemented and tested |
| SWP-08 The board, New work and Administration offer the choice. | `apps/web/src/lib/workflow.ts`, `features/board/WorkflowSwitch.tsx`, `components/NewWorkModal.tsx`, `features/admin/AdminSections.tsx` | `lib/workflow.test.ts`, `board.test.tsx`, `newwork.test.tsx`, `policies-admin.test.tsx` | implemented and tested in jsdom |
| SWP-09 The two authors are credited and their licences retained. | `THIRD_PARTY_NOTICES.md`, `docs/third-party/register.md`, pack `LICENSE`s, `docs/patterns/ode-to-two-workflows.md` | `check_register.py` (no new problem) | done |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A package can run under the playbook, Superpowers, Pocock or Pocock Superpowers workflow, chosen per card with a project default and in New work, separate from its context profile. The two upstream packs are generated from pinned commits with digests and a `--check`; the composer puts the right stage card in the intake, author and pre-check briefs and ships the named upstream skills as verified inputs; a run whose pack is missing or tampered never starts; a sync script reports every upstream change for a person to read. Playbook briefs are byte for byte unchanged. The owner's recorded yes for the two `spec/` fields is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
