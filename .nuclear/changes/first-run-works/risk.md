# Risk: A first run that works: Setup seats only agents that can start, and doctor says why one can't

- R-01: a Claude Code npm build is trusted that should not be. The platform build must carry the matching package name and version, be a native executable, and be the only one found; it is then pinned by its own digest like any native install, and the sandbox and probe checks are unchanged.
- R-02: a seated agent is hidden. Rows only leave the table when the daemon reports the agent missing or the platform cannot run it; an agent not yet reported stays as before.
- R-03: a typed repository path reaches outside home. The path goes through the existing `resolveSafeWorkspaceRoot` and repository checks on the server; the client only chooses which folder to ask about.
- R-04: an existing install loses its database. The data folder is not tied to a port; an install without `pg.port` keeps 7301, and the one move (web app now on that port) is logged.
- R-05: /proc fallback names the wrong process. It runs only when ps or lsof is missing on Linux, and the record's start time comes from the same source as the check, so a record still names one process.
- Trust surface: none. No `.github/`, `kernel/`, `policies/`, `tests/redteam/`, `spec/` or `docs/adr/` file changes.

## Selected mode

- **Mode:** Standard
- Basis: user-facing setup, doctor and launch paths with tests; reversible by revert; no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a fresh machine, Setup seats only the agents installed here and runnable on this platform, and every other row says why with the fix (install, sign in, macOS only, native build, not available yet). A card made while no agent is ready says so and links to Setup. The project form says where local repositories are looked for and takes a typed folder. `controlrod doctor` keeps checking as root, exits 1 under `--strict` while agent runs can't start, names native Windows as missing with the WSL2 fix, and a background start always prints the agent rows. The bundled database no longer sits on the web port's neighbour, and existing installs keep their data and port. Web, API, daemon and script tests pass, and the change record validates.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
