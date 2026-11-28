# Basis: CI that tests what users run

**Change slug:** `ci-tests-what-users-run`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 code review (batch 7) found that CI tested the parts and never the product. It never built or started the app, never tested `doctor`, never rebuilt the committed WebAssembly kernel, and never ran five repository checks the docs rely on, three of which failed on main. The API tests compiled PostgreSQL from source on every run because the bundled one lacks `pg_dump` (#202). CODEOWNERS missed the WebAssembly kernel and other surfaces that decide what runs.

## Proposal

1. Make the failing gates pass without weakening them: AGENTS.md under its byte budget (the docs batch's trim, plus rule 2 pointing to CODEOWNERS), four change records moved to the six-column owner-decisions table with the owner's words unchanged, and the command inventory regenerated.
2. New CI jobs: `product` (install, `pnpm cr link`, `controlrod start --no-open`, `/health`, the page, `controlrod stop`, as the runner's ordinary user), `kernel-wasm` (rebuild and `git diff --exit-code`, then the decision table through the build), and `gates` (tools tests, the repository checks, bench, check action, SPDX, the nuclear-grade script tests, the lifecycle model and its traces).
3. Existing jobs: `go test -race`; `pnpm spec` with all three outputs diffed; API tests on the bundled PostgreSQL with PostgreSQL 17 client tools from the PGDG apt repository for the backup rehearsal; main's runs never cancelled; pyyaml, pytest and Syft pinned; one mise-action version.
4. `tools/test-api.mjs` needs only server programs for the bundled path, finds client tools separately, and checks build tools before downloading source.
5. `scripts/test/doctor.test.mjs` runs the real `doctor` on a made-up machine; it found and this change fixes the literal `${me}` (#203).
6. `kernel/tests/transition_table.rs` and `transition-table.tsv`: every state, action, actor kind and signature, with the floors checked on every row; the same table through the WebAssembly build. `scripts/build-kernel-wasm.sh` builds the same bytes on any machine.
7. CODEOWNERS adds `services/api/kernel/`, `daemon/internal/runner/`, `scripts/`, `packages/check-action/action.yml` and `services/api/src/auth.ts`; the docs list the same set.

## Out of scope

Kernel decision code (unchanged). Advisory scans (cargo-deny advisories, govulncheck, pnpm audit), which would fail pull requests on new advisories unrelated to them; better as a scheduled job, the owner's choice. A token that lets the readme-shots commit start CI on its own (documented instead). `tools/check_register.py`, which fails on main for two files and is not in this batch. Daemon tests for DMN-1, 2, 4, 7, 8, 9 and 11, which the sandbox and runs batches add with their fixes.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Add `scripts/`, `daemon/internal/runner/`, `packages/check-action/action.yml`, `services/api/src/auth.ts` and `services/api/kernel/` to CODEOWNERS, which makes them trust surfaces. | none: authoring agent's choice, open to the owner | 2026-11-28, batch 7 brief from the coordinating session, following review findings CI-4 and CI-5 | Changes under these paths need the owner's recorded yes from now on. | Whether `tools/` (the gate scripts) should be one too. |
| D2 | CI installs PostgreSQL 17 client tools from the PGDG apt repository so the backup rehearsal keeps running, and fails if they are missing. | none: authoring agent's choice, open to the owner | 2026-11-28, batch 7 | The rehearsal ran in CI before (on the compiled PostgreSQL) and still does. | Pinning the exact client minor version. |
| D3 | Readme-shots commits that start no CI are documented, with a hand run from the Actions tab, instead of given a token that starts CI. | none: authoring agent's choice, open to the owner | 2026-11-28, batch 7 | No new secret and no wider token in a job that holds a write token. | A GitHub App token, if the owner wants CI to start by itself. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CI installs and starts Control Rod as an ordinary user and checks that it answers and stops; rebuilds the WebAssembly kernel and fails on any difference; runs the repository's own checks, the doctor tests, the kernel decision table in Rust and WebAssembly, and the daemon tests under the race detector; and runs the API tests on the bundled PostgreSQL without compiling one. Every gate that failed on main passes, and no gate is weakened. The owner signs the `.github/` and other trust-surface changes before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
