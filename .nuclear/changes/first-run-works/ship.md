# Ship: A first run that works: Setup seats only agents that can start, and doctor says why one can't

Release decision: **pending**. Merging is the owner's decision.

- Rollback: revert the merge. A `pg.port` file written by the new server is harmless to the old one, which ignores it; an install that moved to 17300 by itself (only a new install) goes back to 7301 with its data, which is not tied to the port.
- Monitoring after merge: on a clean Linux machine, Setup seats only installed agents and names Antigravity and Grok CLI as macOS only; a card made before any agent is ready says so; `controlrod doctor --strict` exits 1 until bubblewrap, socat and an agent are in place.
- Limits: not run on a real clean machine, macOS or native Windows. The Claude Code npm layout is checked against folders the tests build, matching version 2.1.332's published package. `mise install node pnpm go python` follows mise's documentation and was not run here (mise is not installed in this session). The splitting of mise.toml waits for the CI batch.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a fresh machine, Setup seats only the agents installed here and runnable on this platform, and every other row says why with the fix (install, sign in, macOS only, native build, not available yet). A card made while no agent is ready says so and links to Setup. The project form says where local repositories are looked for and takes a typed folder. `controlrod doctor` keeps checking as root, exits 1 under `--strict` while agent runs can't start, names native Windows as missing with the WSL2 fix, and a background start always prints the agent rows. The bundled database no longer sits on the web port's neighbour, and existing installs keep their data and port. Web, API, daemon and script tests pass, and the change record validates.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
