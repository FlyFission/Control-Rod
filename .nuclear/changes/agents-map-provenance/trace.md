# Trace: agent map check and port provenance

| Requirement | Where | Tests | Disposition |
|---|---|---|---|
| M-1 `AGENTS.md` larger than its recorded budget fails; equal or smaller passes. | `tools/check_agents_map.py` `budget_problems` | `test_budget_refuses_growth_and_allows_shrinking`, `test_missing_budget_file_fails` | done |
| M-2 Every relative link, `@` import and backticked path in `AGENTS.md` and `CLAUDE.md` exists. | `missing_references` | `test_existing_references_pass`, `test_broken_link_backtick_path_and_import_fail`, `test_urls_placeholders_and_plain_code_are_not_paths` | done |
| M-3 The budget is measured, not typed. | `--record`, `tools/agents_map_budget.json` | E-02 | done |
| P-1 A code row in the register names an existing provenance file that lists the file. | `tools/check_register.py` `provenance_problems` | `test_code_row_needs_an_existing_provenance_table_that_lists_the_file`, `test_complete_row_with_retained_license_passes` | done |
| P-2 Font and asset rows need no provenance file. | same | `test_font_license_is_accepted_for_font_files_only` | done |
| P-3 The provenance outline covers removed, changed, tests carried, not carried and behaviour differences. | `docs/third-party/port-provenance.md` | Review | open: owner review |
| M-4 The agent map check runs in CI. | `.github/workflows/ci.yml` | none | not in this change: owner signature |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`tools/check_agents_map.py` passes on this branch with a recorded budget, `tools/check_register.py` requires a provenance file for every ported code file, both have passing tests, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
