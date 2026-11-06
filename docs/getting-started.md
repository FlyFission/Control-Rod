# Getting started

How to run Control Rod on your machine and how to check that your change did not break it. For what exists and what does not, read [status.md](status.md) first.

## Prerequisites

The toolchain is pinned in [`mise.toml`](../mise.toml). The easiest route is [mise](https://mise.jdx.dev): `mise install` in the repository root gives you every pinned version, and CI uses the same pins.

| Tool | Version | Used for |
| --- | --- | --- |
| Node | 22 | API, web app, tooling |
| pnpm | 10.28.0 | workspace and scripts |
| Rust | 1.97.0 | kernel (and its WASM binding) |
| Go | 1.24.7 | run daemon |
| Python and uv | 3.13, uv 0.11.32 | Python SDK, tools, site-concept pack |

Optional, for real agent runs: [Claude Code](https://claude.com/claude-code) signed in (agents run on your own subscription) and Codex (so pre-checks have an independent runtime). Without Codex, a pre-check waits until you sign a written override with your passkey; `pnpm cr doctor` explains this. For drawings you need CADCraft: `pnpm cr setup-cadcraft` builds the pinned version and needs Rust.

The embedded database refuses to run as root, so use an ordinary user account.

If `pnpm cr doctor` reports that the database cannot start, it means the bundled PostgreSQL could not load its libraries. `pnpm-workspace.yaml` allows the install step that creates them (`onlyBuiltDependencies`); an install done before that was added can lack them, and `rm -rf node_modules && pnpm install` fixes it. Otherwise set `CONTROLROD_DATABASE_URL` to your own PostgreSQL 17 superuser connection, as `doctor` shows.

## Run it

```sh
pnpm install --frozen-lockfile
pnpm cr doctor   # lists anything missing
pnpm cr start    # control plane, embedded Postgres and daemon; Ctrl+C stops all
```

Open <http://localhost:7300>, choose **Set up this machine**, and register a passkey. Your data lives in `~/.controlrod` unless you set `CONTROLROD_HOME`; use a separate home for experiments so you never touch real records:

```sh
export CONTROLROD_HOME="$HOME/.controlrod-dev"
```

Useful environment variables: `CONTROLROD_PORT` (default 7300), `CONTROLROD_DATABASE_URL` (use your own Postgres instead of the embedded one), `CONTROLROD_GUIDED_PREPARATION=1` and `CONTROLROD_PREPARED_RELEASE=1` (turn on guided preparation and prepared release, both off by default). The step-by-step owner run is in [owner-pilot.md](owner-pilot.md).

**Agents run for real.** `pnpm cr start` also starts the daemon, which launches Claude Code or Codex processes under your login, inside the sandbox policy recorded for the run ([ADR 0021](adr/0021-native-cli-sandboxes.md)). If you only want the API and web app, see the pilot guide for starting the API alone.

## Dev container and Codespaces

`.devcontainer/` describes an Ubuntu 24.04 environment with Node 22, pnpm, Go, Python, uv and Rust at the pinned versions. Open the repository in GitHub Codespaces, or in VS Code with the Dev Containers extension (**Reopen in Container**). Setup installs dependencies and builds everything (a few minutes on first build); then run `pnpm cr start`.

- In VS Code the app is at <http://localhost:7300> through port forwarding, same as on your own machine.
- In Codespaces the app is at a forwarded `https://<name>-7300.app.github.dev` address. `pnpm cr start` detects Codespaces and sets the passkey origin to match. A passkey is bound to the address it was created on, so one made in a Codespace does not work anywhere else, and the data goes when the Codespace is deleted. Treat it as a place to try and build, not to keep real records.
- Agent runs need Claude Code signed in inside the container (`npm i -g @anthropic-ai/claude-code`, then `claude`). Runs also start only on a platform whose sandbox has been qualified, which so far is WSL2; on other platforms the preflight refuses the run and says why. Expect the container to be fine for the web app, the API, and all the tests, and not yet for real agent runs.
- The configuration was checked by running its setup script on a fresh clone as a non-root user and starting the app with Codespaces-style variables. The container image itself has not yet been built by anyone, so report anything that breaks.

## Check your change

These mirror the CI jobs in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Run the ones for the area you touched.

| Area | Commands |
| --- | --- |
| TypeScript (API, web, spec) | `pnpm --filter @control-rod/spec run build && git diff --exit-code -- spec/generated`, then `pnpm -r run typecheck` and `pnpm -r run test` |
| Rust (kernel) | `cargo fmt --all --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` |
| Go (daemon) | In `daemon/`: `gofmt -l .` (must print nothing), `go vet ./...`, `go test ./...` |
| Python (SDK) | In `sdk/python/`: `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest -q` |
| Licences | `node tools/license-gate.mjs` |
| Change records | `uv run --with pyyaml python tools/check_redteam.py`, and validate your record with `tools/ng.py` from the pinned [nuclear-grade-context-engineering](https://github.com/FlyFission/nuclear-grade-context-engineering) checkout (CI shows the exact command) |

The API tests use a real PostgreSQL 17 and nothing is mocked; [test-database.md](test-database.md) explains how the harness finds or builds one. Run them through `pnpm --filter @control-rod/api test`, not by calling `vitest` directly.

Two API tests (`command-boundary` SEC-01 and SEC-03) fail when the test database uses trust authentication. See [status.md](status.md#known-failures-and-rough-edges) before you chase them.

## Generated code

`spec/` is the source of truth. Never hand-edit anything under `spec/generated/`. After changing a `.tsp` file, run `pnpm spec` and commit the regenerated output; CI fails if regeneration shows drift.

## Where to look next

- [AGENTS.md](../AGENTS.md): the rules for any agent or person working here.
- [docs/README.md](README.md): index of decisions, specs and guides.
- [collaboration.md](collaboration.md): how work is tracked, reviewed and merged.
- [threat-model.md](threat-model.md): what Control Rod defends against and what it cannot.
