# Plan: Claude checks on a Mac can run commands and write their verdict

1. Read the three failed runs' logs (EPERM on mkdir under /private/tmp/claude-501; Write refused before Read).
2. Test first for the environment, then set CLAUDE_CODE_TMPDIR next to TMPDIR and add the prompt line; regenerate the launch goldens.
3. Vet for linux and darwin, runner tests; PR, merge on green; rerun the checks on the Mac.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker can run its read-only Bash commands and write its verdict: the checker environment points CLAUDE_CODE_TMPDIR and TMPDIR at the per-run folder, and the checker prompt says both verdict files already exist and must be read before they are written. A unit test pins the environment, the launch goldens are regenerated, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
