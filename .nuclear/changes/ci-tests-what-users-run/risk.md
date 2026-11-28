# Risk: CI that tests what users run

- R-01: a new job fails on GitHub for a reason this machine cannot show (runner images, network, the PGDG repository, the bundled PostgreSQL's libraries on Ubuntu). The jobs are new checks: if one fails, the PR shows it, and the fix is in the job, never a skip. The product job's failure step prints the app's log.
- R-02: the WebAssembly rebuild differs on the runner. Mitigated: the build script maps the cargo home to one fixed name, and a rebuild with a different cargo home matched the committed file byte for byte here. Rust and wasm-bindgen versions are pinned.
- R-03: the API suite now runs on the bundled PostgreSQL instead of a compiled one. That is the PostgreSQL users run. The backup rehearsal keeps running in CI with PGDG client tools, and CI fails if they are missing.
- R-03a: the runner image's own PostgreSQL differs from the bundled one (Ubuntu 26.04 ships 18). CI names the bundled server (`CONTROLROD_TEST_PG_SERVER=bundled`), and the bootstrap and the rehearsal refuse client tools of another major version before any test runs.
- R-04: the race detector finds a real race or slows a timing-sensitive test. A race is a bug to fix. Locally, `go test -race ./...` found no race.
- R-05: wider CODEOWNERS (`scripts/` especially) asks for the owner's yes on more pull requests. That is the point of the finding; the owner may narrow it.
- R-06: `pnpm cr link` in the product job edits the runner's `~/.bashrc`. The runner is thrown away after the job.
- Trust surface: `.github/` (workflows, CODEOWNERS, templates), `scripts/` and `kernel/tests/` (tests only; no decision code), under the sole-maintainer sign-off.

## Selected mode

- **Mode:** Standard
- Basis: CI and test additions; no product behavior change except one doctor message; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

CI installs and starts Control Rod as an ordinary user and checks that it answers and stops; rebuilds the WebAssembly kernel and fails on any difference; runs the repository's own checks, the doctor tests, the kernel decision table in Rust and WebAssembly, and the daemon tests under the race detector; and runs the API tests on the bundled PostgreSQL without compiling one. Every gate that failed on main passes, and no gate is weakened. The owner signs the `.github/` and other trust-surface changes before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
