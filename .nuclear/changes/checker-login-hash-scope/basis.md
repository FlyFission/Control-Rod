# Basis: A check is not voided when another agent run writes the shared login folder

On the owner's Mac on 2026-11-26, two Claude pre-checks (R-f5b5fc28 and R-f86f8cec, 00:05:32 to 00:08:37Z) were voided: "outcome wrote_files: the checker's login instructions or settings changed". At 00:06:28Z another board run, a Claude author run (pid 11969), started and wrote ~/.claude/plugins/store/cc-plugin-agents-md_builtin-*.json. Claude Code's plugin bookkeeping (store, synced/.in_use, plugin-directory cache) and Codex's skill sync change these folders whenever any CLI starts. Those checkers run under Seatbelt, which denies every write outside scratch except the credential file, so they could not have written it. The hash was only detecting other processes. That is the same class as #230's Codex skill-sync voids.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The protected-login hash is compared only for a checker that could write its real login folder (self-confined, no disposable home). Mounted Claude and Codex checkers on Linux and macOS, and macOS Codex checkers with their own home, are not compared. Grok and Antigravity still are. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
