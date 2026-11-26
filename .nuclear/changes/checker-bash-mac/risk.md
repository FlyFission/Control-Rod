# Risk: Claude checks on a Mac can run commands and write their verdict

- No Seatbelt rule changes: Claude Code's temporary files move into the folder the checker may already write, which the daemon removes after the run.
- The prompt line changes only the order of the checker's own writes.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker can run its read-only Bash commands and write its verdict: the checker environment points CLAUDE_CODE_TMPDIR and TMPDIR at the per-run folder, and the checker prompt says both verdict files already exist and must be read before they are written. A unit test pins the environment, the launch goldens are regenerated, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
