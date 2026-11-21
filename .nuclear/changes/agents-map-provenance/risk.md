# Risk: agent map check and port provenance

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-16 instruction to start PL6 and PL7.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or `spec/` major version.
- Scope: the files listed in `basis.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The budget is a number typed by a model. | The script measures the file and writes its size and SHA-256; nobody types the value. | A budget file whose bytes or digest do not match a recorded measurement. |
| R-02 | The guide is grown by re-recording the budget without review. | Re-recording changes a tracked file, so it shows in the pull request; the check says to move detail out first. | A budget change merged with no reason in its change record. |
| R-03 | The check is taken as enforced when it runs by hand only. | The getting-started row, the pattern note and `ship.md` say it is not yet in CI. | Any record that claims CI enforcement before the workflow change is signed. |
| R-04 | The provenance rule is bypassed by a code port that has no register row. | The existing marker scan still flags marked files; the overlap scan still reports unregistered copies; review stays responsible, as the register already says. | A port merged without a register row or provenance file. |
| R-05 | The new register rule breaks the existing font rows. | It applies to code suffixes only; a test keeps the font row passing. | A font or asset row refused by the rule. |

## Selected mode

- **Mode:** Standard
- Basis: tooling and documentation, no trust surface; it changes a check that ports must pass.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`tools/check_agents_map.py` passes on this branch with a recorded budget, `tools/check_register.py` requires a provenance file for every ported code file, both have passing tests, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
