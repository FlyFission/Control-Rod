# Ship: Codex checks run on a Mac again: a login home of their own

Release decision: **pending owner decision.**

- Rollback: revert the merge. No migration.
- Superseded (2026-11-25): the next Mac run showed Codex's own Seatbelt helper cannot start inside the outer profile, so [codex-checker-self-confined-mac](../codex-checker-self-confined-mac/plan.md) stops wrapping Codex on macOS and removes this isolated home.
- Monitoring after merge: a Codex pre-check on macOS produces a verdict, and `codex login status` still works on the host afterwards.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check runs with CODEX_HOME in its own per-run temporary directory, holding a copy of the sign-in. The real login folder, sign-in file included, is never writable during the check. A refreshed sign-in is saved back only when it changed, is valid JSON, and the host file still holds what was copied in. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
