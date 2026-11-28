# Basis: A first run that works: Setup seats only agents that can start, and doctor says why one can't

**Change slug:** `first-run-works`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review (batch 3, "A first run that works") found that a first run on a clean machine went wrong in many small ways. Setup seated every agent, installed or not, so the first card waited forever with "Intake queued". Antigravity and Grok CLI were offered on Linux, where the daemon never starts them. An npm install of Claude Code was refused with no fix given. The project form listed repositories from a folder it never named. Doctor stopped at the root message, exited 0 when agents could not run, and a background start hid the sandbox rows. `mise install` left pnpm off PATH and fetched contributor tools nobody needs to run the app. The obvious workaround for a busy port 7300, `CONTROLROD_PORT=7301`, was the bundled database's port. The design here is our own; no donor code is used. Claude Code's npm layout was read from its published package (proprietary licence), and only the folder layout is mirrored, with no code copied.

Findings: RUN-1, RUN-2, RUN-3, RUN-4, RUN-5, RM-6, DMN-3, DMN-25, CLI-3, CLI-5, CLI-6, CLI-7, CLI-8 (README line), CLI-9, CLI-10, CLI-12, CLI-20 (docs part), DOC-7. #203 is left to PR 244.

## Proposal

1. Web Setup and roster: a row is seated only when its agent is installed here and runnable on this platform. Every other row names why and the fix: not installed (install command), not signed in, script launcher (Claude Code's native install), macOS only (Antigravity, Grok CLI off macOS), not available yet (OpenCode, Ollama). Runtime pickers in New Work, the board and the project form disable what cannot run here.
2. Board: a card captured while no agent is ready says "No agent is ready, so intake can't start" with an Open Setup link, on the card and in its drawer.
3. Project form: says which folder local clones are listed from (`CONTROLROD_WORKSPACE_ROOT` or `~/projects`) and takes a typed folder or repository path, checked by the existing safe `/repos?workspace_root` (inside home, no dot folder, no links, must hold a git repository). GitHub listing errors read as plain words with the fix.
4. Daemon: Claude Code's npm package is followed to the native platform build npm's install step put in place, pinned by its own digest; anything else stays refused with the native install command. The "no runtime" error names every runtime that can start here. `controlrod runtimes` marks the macOS-only ones.
5. API: the bundled PostgreSQL port is the web port plus 10000 for a new install, kept in `pg.port`; an install made before keeps 7301; `CONTROLROD_PG_PORT` overrides.
6. Scripts: doctor's machine checks move to `scripts/lib/doctor.mjs` so tests can stand in a platform, user id and PATH. Root is one MISSING row; native Windows is a MISSING row with WSL2; `doctor --strict`; agent CLI rows with fixes; the background start prints the agent rows; doctor says when it compiles the daemon. Instance tracking reads /proc on Linux when ps or lsof is missing.
7. Docs: README and getting-started show `mise install node pnpm go python` and `mise activate`, python3, the native Claude Code install, `CONTROLROD_WORKSPACE_ROOT` and `CONTROLROD_PG_PORT`; the quickstart links the Linux sandbox setup; the owner pilot reads the database port from `pg.port`.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Bundled database port is the web port plus 10000, recorded in pg.port, legacy installs keep 7301 | none: authoring agent's choice, open to the owner | 2026-11-28, batch 3 session | The alternative was web port plus one with a collision check; plus 10000 never meets a nearby web port. | Moving existing data folders. |
| D2 | Follow Claude Code's npm package to its native platform build; pnpm shims stay refused | none: authoring agent's choice, open to the owner | 2026-11-28, batch 3 session | The alternative was refusing every npm install with the native install command. | Following pnpm's or other managers' layouts. |
| D3 | `doctor --strict` fails while agent runs can't start; plain doctor fails only for the app and for native Windows | none: authoring agent's choice, open to the owner | 2026-11-28, batch 3 session | The alternative was failing plain doctor for any agent problem, which would break scripts that only start the app. | Changing what `start` refuses. |
| D4 | CLI-20 is documented as `mise install node pnpm go python`; splitting mise.toml waits for the CI batch | none: authoring agent's choice, open to the owner | 2026-11-28, batch 3 session | A MISE_ENV split needs a `.github/` change, a trust surface. | Any `.github/` edit. |

## Out of scope

#203 (literal `${me}` in doctor), fixed by PR 244. Splitting mise.toml into user and contributor tools (needs `.github/`). OpenCode and Ollama runs.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a fresh machine, Setup seats only the agents installed here and runnable on this platform, and every other row says why with the fix (install, sign in, macOS only, native build, not available yet). A card made while no agent is ready says so and links to Setup. The project form says where local repositories are looked for and takes a typed folder. `controlrod doctor` keeps checking as root, exits 1 under `--strict` while agent runs can't start, names native Windows as missing with the WSL2 fix, and a background start always prints the agent rows. The bundled database no longer sits on the web port's neighbour, and existing installs keep their data and port. Web, API, daemon and script tests pass, and the change record validates.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
