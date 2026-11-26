# Basis: Claude checks on a Mac write their verdict (file tools, no nested sandbox)

After #236 the three Claude checks on the owner's Mac (R-66291926, R-c6dcc9e4, R-e89c25f1) still ended without a verdict. Every Bash call ended "Exit code 71, sandbox-exec: sandbox_apply: Operation not permitted": Claude Code runs Bash in its own Seatbelt sandbox, and Seatbelt cannot be applied inside the daemon's checker profile. The Write tool failed "EPERM ... open scratch/verification.json.tmp.31725.0512e79354d8": Claude Code replaces a file by writing a temporary sibling and renaming it, and only the verdict files themselves were writable. Card checkers are only offered Bash(python3:*) (services/api DEFAULT_TOOLS), so a Mac Claude checker loses little without Bash; Codex checkers on a Mac keep commands under Codex's own sandbox (#228).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker writes its verdict with its file tools and is never offered a Bash tool that cannot start: the Seatbelt profile allows only the <verdict>.tmp.<pid>.<hex> sibling that Claude Code replaces a file through, and the macOS Claude checker launch drops Bash because Seatbelt cannot nest. Unit and darwin tests pin both, and a real Claude check on the owner Mac ends with a verdict.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
