# Plan: agent map check and port provenance

1. Write `tools/check_agents_map.py` with tests: the size budget from a recorded measurement, and the reference check for `AGENTS.md` and `CLAUDE.md`.
2. Record the budget with `--record`.
3. Add the provenance rule to `tools/check_register.py` with tests, and write `docs/third-party/port-provenance.md`.
4. Update the register rules, the getting-started checks table and the PL6 and PL7 rows of the pattern note.
5. Later, with an owner signature: run `tools/check_agents_map.py` in CI.

Steps 1 to 4 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`tools/check_agents_map.py` passes on this branch with a recorded budget, `tools/check_register.py` requires a provenance file for every ported code file, both have passing tests, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
