# Trace: CI that tests what users run

| Finding | Need | Change | Check |
| --- | --- | --- | --- |
| CI-3 | Gates the docs rely on run, and pass | AGENTS.md, four `basis.md` tables, `docs/commands/inventory.md`; job `gates` | E-01, E-02 |
| CI-2 | Doctor and its exit code are tested | `scripts/test/doctor.test.mjs`, `fixtures/doctor-system.mjs`; `${me}` fix in `scripts/cr.mjs` | E-03 |
| CI-1 | CI installs, starts, checks and stops the app as an ordinary user | job `product` | E-04 |
| TEST-1, #202 | Bundled PostgreSQL is enough; rehearsal tools separate; build tools checked first | `tools/test-api.mjs`, `docs/test-database.md` | E-05 |
| CI-7 | CI compiles no PostgreSQL | job `typescript`: bundled server, PGDG client tools | E-05 |
| CI-4, DMN-5 | The committed WebAssembly kernel matches its source; CODEOWNERS covers it | job `kernel-wasm`, `scripts/build-kernel-wasm.sh`, CODEOWNERS | E-06 |
| KRN-1 | Every state, action and actor, in Rust and WebAssembly | `kernel/tests/transition_table.rs`, `transition-table.tsv`, `transition_table.test.mjs` | E-07 |
| CI-5 | CODEOWNERS covers the other trust surfaces, listed alike everywhere | CODEOWNERS, collaboration.md, CONTRIBUTING.md, AGENTS.md, templates | E-02 |
| DMN-19 | Race detector on the daemon | job `go`: `go test -race ./...` | E-08 |
| PKG-5 | All `pnpm spec` outputs drift-checked | job `typescript` | E-09 |
| CI-6 | Readme-shots commits that start no CI | note in `readme-shots-commit.yml` and collaboration.md; `workflow_dispatch` on ci | review |
| CI-8 | Pinned pyyaml, pytest and Syft; one mise-action version | ci.yml, platforms.yml | E-10 |
| CI-9 | Main's own CI is never cancelled | ci.yml concurrency | E-10 |
| DMN-33 | Daemon tests for DMN-1, 2, 4, 7, 8, 9, 11 | covered by the sandbox and runs batches | none here |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CI installs and starts Control Rod as an ordinary user and checks that it answers and stops; rebuilds the WebAssembly kernel and fails on any difference; runs the repository's own checks, the doctor tests, the kernel decision table in Rust and WebAssembly, and the daemon tests under the race detector; and runs the API tests on the bundled PostgreSQL without compiling one. Every gate that failed on main passes, and no gate is weakened. The owner signs the `.github/` and other trust-surface changes before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
