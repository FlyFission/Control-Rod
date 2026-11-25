# Basis: Codex checks run on a Mac again: a login home of their own

On 2026-11-25 the sandbox card's Codex check (codex-cli 0.172.0) on the owner's Mac exited 1 within 4 s: "failed to initialize in-process app-server client: Operation not permitted" and "could not create PATH aliases". The same command with no Control Rod sandbox answers normally. Codex now writes runtime state under its home before it reads the brief, and the macOS Seatbelt profile kept ~/.codex read-only apart from auth.json. Linux already gives Codex a per-run CODEX_HOME (`mountIsolatedLoginHome`). Seatbelt cannot bind the host sign-in into it, so macOS copies it in and saves a refreshed one back.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check runs with CODEX_HOME in its own per-run temporary directory, holding a copy of the sign-in. The real login folder, sign-in file included, is never writable during the check. A refreshed sign-in is saved back only when it changed, is valid JSON, and the host file still holds what was copied in. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
