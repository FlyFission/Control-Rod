# Trace: Claude checks on a Mac write their verdict (file tools, no nested sandbox)

| Need | Code | Test |
| --- | --- | --- |
| Verdict written through the tool's temporary sibling | `checker.go` seatbeltAtomicWrites, `checker_mount_darwin.go` | `checker_test.go` TestSeatbeltAtomicWritesAllowOnlyTheToolTempSibling; `checker_darwin_test.go` TestSeatbeltCheckerCanReplaceItsVerdictAtomically |
| No Bash where Seatbelt cannot nest | `runtime.go` checkerOuterSeatbelt, withoutBash, ClaudeArgs | `checker_test.go` TestClaudeCheckerUnderOuterSeatbeltHasNoBash |
| A real check ends with a verdict | whole checker path | `real_check_darwin_test.go` TestRealCheckerOnThisMac (CONTROLROD_REAL_CHECKER=claude, run on the owner's Mac) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker writes its verdict with its file tools and is never offered a Bash tool that cannot start: the Seatbelt profile allows only the <verdict>.tmp.<pid>.<hex> sibling that Claude Code replaces a file through, and the macOS Claude checker launch drops Bash because Seatbelt cannot nest. Unit and darwin tests pin both, and a real Claude check on the owner Mac ends with a verdict.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
