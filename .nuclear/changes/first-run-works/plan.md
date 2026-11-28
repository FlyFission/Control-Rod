# Plan: A first run that works: Setup seats only agents that can start, and doctor says why one can't

1. Web: `agents.ts` row states and seatable rule; Setup, AgentList, councilFlow; runtime pickers gated by platform; no-agent-ready line on the capture card and drawer; project form repository finder.
2. API: `githubListError` for plain GitHub errors; `pg-port.ts` and its use in `server.ts`.
3. Daemon: `claudeFromWrapper` in `artifact.go`; `NoRuntimeMessage`; macOS-only flag in `controlrod runtimes`.
4. Scripts: `scripts/lib/doctor.mjs`, doctor and background start in `cr.mjs`, /proc fallback in `instance.mjs`; leave `agentChecks` as it is for PR 244.
5. Docs: README, getting-started, quickstart-check, daemon, owner-pilot.
6. Tests for each, typecheck, gates, change record validation. Commit locally; the owner opens the PR and decides the merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a fresh machine, Setup seats only the agents installed here and runnable on this platform, and every other row says why with the fix (install, sign in, macOS only, native build, not available yet). A card made while no agent is ready says so and links to Setup. The project form says where local repositories are looked for and takes a typed folder. `controlrod doctor` keeps checking as root, exits 1 under `--strict` while agent runs can't start, names native Windows as missing with the WSL2 fix, and a background start always prints the agent rows. The bundled database no longer sits on the web port's neighbour, and existing installs keep their data and port. Web, API, daemon and script tests pass, and the change record validates.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
