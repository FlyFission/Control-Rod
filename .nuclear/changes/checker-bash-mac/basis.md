# Basis: Claude checks on a Mac can run commands and write their verdict

After #235, Claude (Haiku) checks on the owner's Mac reached the model and read the work, but all three (R-75c1c88f, R-e64885ef, R-09ffa33e) ended without a verdict. Every Bash call failed with "EPERM: operation not permitted, mkdir '/private/tmp/claude-501/<working directory>'". Claude Code keeps that folder under CLAUDE_CODE_TMPDIR, else /tmp/claude-<uid>, and ignores TMPDIR for it. The checker's Seatbelt profile allows writes only to scratch and the per-run folder. The installed Claude Code binary names CLAUDE_CODE_TMPDIR and asks for a private (0700) directory, which the per-run folder is. The Write tool then refused scratch/verification.json with "File has not been read yet", because the daemon creates both verdict files empty before the run. Anthropic's open-source sandbox runtime also sets CLAUDE_CODE_TMPDIR for sandboxed Claude Code (reviewed as a pattern only).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker can run its read-only Bash commands and write its verdict: the checker environment points CLAUDE_CODE_TMPDIR and TMPDIR at the per-run folder, and the checker prompt says both verdict files already exist and must be read before they are written. A unit test pins the environment, the launch goldens are regenerated, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
