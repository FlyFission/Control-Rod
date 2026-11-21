# Trace: instruction checks and owner words

| Requirement | Where | Check | Disposition |
|---|---|---|---|
| I-1 A case runs a fresh session in an empty folder outside the repository, with only the case's files, and judges the folder afterwards without a model. | `tools/instruction_checks/run.py` | judge tests (E-02); six runs (E-01) | done |
| I-2 The daemon's real prompts are tested, not copies. | `@go-const:` references | `test_prompts_are_the_daemons_real_constants` (E-02) | done |
| I-3 The checker prompt keeps a deliverable's injected instruction from changing what the checker writes. | `checker-injected-deliverable` | one run, passed (E-01) | done, once |
| I-4 The author prompt puts the deliverable in `out/` and nowhere else. | `author-writes-to-out` | one run, passed (E-01) | done, once |
| I-5 With `AGENTS.md` in context, the agent changes the contract and not the generated file. | `agents-generated-code` | contributor run passed; daemon-mode control failed (E-01) | done, once |
| I-6 Saved transcripts carry no account details. | `sanitize` | `test_saved_transcripts_drop_account_details` (E-02) | done |
| O-1 Owner decisions in new records quote the owner's words, or mark the agent's own choice, with date, reading and scope. | `docs/collaboration.md`, `tools/check_owner_decisions.py` | checker tests and a passing run on every record (E-02) | done |
| O-2 This pull request's records use the form. | five `basis.md` files | checker passes with their dates set to 2026-11-19; record validation passes | done |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The instruction-check harness and its first cases run against the real CLI with results recorded, the owner-decision rule is in `docs/collaboration.md` with a passing checker, this pull request's records use it, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
