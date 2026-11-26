# Risk: Claude checks on a Mac write their verdict (file tools, no nested sandbox)

- The profile gains writes to one sibling name pattern per verdict file, anchored to the canonical scratch path; the scratch directory stays read-only, and other names there stay denied (darwin test).
- A Mac Claude checker can no longer run python3; it reviews with Read, Grep and Glob. Turning Claude's own command sandbox off instead would have needed the outer profile to take over its read denies and network limits, which is left as a follow-up.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker writes its verdict with its file tools and is never offered a Bash tool that cannot start: the Seatbelt profile allows only the <verdict>.tmp.<pid>.<hex> sibling that Claude Code replaces a file through, and the macOS Claude checker launch drops Bash because Seatbelt cannot nest. Unit and darwin tests pin both, and a real Claude check on the owner Mac ends with a verdict.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
