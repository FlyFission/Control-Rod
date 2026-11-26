# Plan: Claude checks on a Mac write their verdict (file tools, no nested sandbox)

1. Read the three failed runs' tool errors (sandbox_apply refused; EPERM on the Write tool's temporary sibling).
2. Tests: profile rule unit test, a darwin test that replaces the verdict through a sibling and cannot create another name, and a launch test that the macOS Claude checker has no Bash.
3. Implement; vet for linux and darwin; prove with a real Claude check on the owner's Mac from the branch; PR, merge on green.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker writes its verdict with its file tools and is never offered a Bash tool that cannot start: the Seatbelt profile allows only the <verdict>.tmp.<pid>.<hex> sibling that Claude Code replaces a file through, and the macOS Claude checker launch drops Bash because Seatbelt cannot nest. Unit and darwin tests pin both, and a real Claude check on the owner Mac ends with a verdict.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
