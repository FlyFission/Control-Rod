# Plan: CI that tests what users run

1. Fix the gates that fail on main: AGENTS.md (docs batch patch plus rule 2), the four owner-decision tables, the command inventory.
2. CODEOWNERS and the trust-surface lists in collaboration.md, CONTRIBUTING.md, AGENTS.md, the PR and issue templates and the break-loop prompt.
3. Doctor tests through the real command; fix `${me}`.
4. `tools/test-api.mjs`: server programs only for the bundled path; client tools separate; build tools checked first. Docs in `docs/test-database.md`.
5. Kernel table test in Rust and WebAssembly; reproducible `build-kernel-wasm.sh`.
6. Workflows: `product`, `kernel-wasm`, `gates`; race detector; `pnpm spec` drift; PGDG client tools; concurrency; pins; mise-action version; readme-shots note.
7. Run every job command locally that can run here, YAML-load every workflow, run `check_workflow_timeouts.py`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CI installs and starts Control Rod as an ordinary user and checks that it answers and stops; rebuilds the WebAssembly kernel and fails on any difference; runs the repository's own checks, the doctor tests, the kernel decision table in Rust and WebAssembly, and the daemon tests under the race detector; and runs the API tests on the bundled PostgreSQL without compiling one. Every gate that failed on main passes, and no gate is weakened. The owner signs the `.github/` and other trust-surface changes before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
