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
| Python and uv | 3.13, uv 0.11.32 | Optional for running Control Rod; required for Python SDK and repository checks |

Optional, for real agent runs: [Claude Code](https://claude.com/claude-code) signed in (agents run on your own subscription) and Codex (so pre-checks have an independent runtime). Without Codex, a pre-check waits until you sign a written override with your passkey; `pnpm cr doctor` explains this.

The embedded database refuses to run as root, so use an ordinary user account.

If `pnpm cr doctor` reports that the database cannot start, it means the bundled PostgreSQL could not load its libraries. `pnpm-workspace.yaml` allows the install step that creates them (`onlyBuiltDependencies`); an install done before that was added can lack them, and `rm -rf node_modules && pnpm install` fixes it. Otherwise set `CONTROLROD_DATABASE_URL` to your own PostgreSQL 17 superuser connection, as `doctor` shows.

## Run it

```sh
mise install               # every pinned version, unless you already have the tools
pnpm install --frozen-lockfile
pnpm cr link       # installs the controlrod command in ~/.local/bin (once)
controlrod start   # checks, builds, starts in the background and opens the app
```

`pnpm cr link` writes a small script to `~/.local/bin/controlrod` that runs this checkout's `scripts/cr.mjs`. If that folder is not on your `PATH`, it adds one line to your shell's startup file (`~/.zshrc`, `~/.bashrc` or `~/.bash_profile`) and says so; open a new terminal afterwards. It never replaces a `controlrod` it did not write; `CONTROLROD_BIN_DIR` picks another folder, and `pnpm cr unlink` removes it. Every `controlrod <command>` is also `pnpm cr <command>` inside the checkout.

### Updating

`controlrod update` checks GitHub, and if `main` has moved on it stops a running Control Rod (running work finishes first), sets any edits you made to Control Rod's own files aside with `git stash`, moves to the new version, installs and builds it, and starts it again the way it was running. If the install or the build fails, it goes back to the version you had and rebuilds that. Your records in `~/.controlrod` are never touched. `controlrod update --check` only lists what is new. It updates the `main` branch only; on another branch it says so and stops.

### Adding cards from a terminal

`controlrod card add "Fix the login typo" --project Sandbox` adds a card the way the board's quick add does: the project's lane, and for a project with a repository a worktree and branch of its own. `controlrod cards` lists every card and the column it is in (`--project` narrows it). Neither needs the browser or a passkey, so an agent working in a terminal can use them too. They use a token Control Rod writes to `~/.controlrod/cli.token` each time it starts, which only lists and adds cards; it cannot accept, release, sign or change settings. Runs never see it, because the Control Rod home is hidden from them.

### Running it in the background

`controlrod start` checks the machine and stops with what to fix if something is missing (`controlrod doctor` shows the full list), builds in front of you, then runs Control Rod detached, opens the app in your browser and returns. `controlrod start --foreground` keeps it in the terminal instead (`Ctrl+C` stops it), and `--no-open` skips the browser; `pnpm cr start` inside the checkout is a terminal start too. Its output goes to `~/.controlrod/logs/controlrod.log` (`controlrod logs -f`). `controlrod stop` stops it from any terminal, the same way as `Ctrl+C`: running work finishes and is saved first, and `controlrod stop --now` skips that wait. `controlrod status` says whether it runs, where, and which version.

### When the database will not start

The control plane prints what PostgreSQL said and the likely fix. On macOS, the most common cause is shared memory: macOS has only 32 System V shared memory segments in all, and a PostgreSQL that is killed outright leaves its segment behind. When they run out, PostgreSQL fails with `could not create shared memory segment: No space left on device`, which has nothing to do with disk space. When the Mac is close to that limit, `controlrod start` frees the segments that are certainly left behind (your own, PostgreSQL's 56-byte size, nothing attached, the process that made them gone) and says how many. `controlrod doctor` lists them at any time, and `controlrod doctor --fix` frees them. Restarting the Mac also clears them.

Open <http://localhost:7300>, choose **Set up this machine**, and register a passkey. Your data lives in `~/.controlrod` unless you set `CONTROLROD_HOME`; use a separate home for experiments so you never touch real records:

```sh
export CONTROLROD_HOME="$HOME/.controlrod-dev"
```

Useful environment variables: `CONTROLROD_PORT` (default 7300), `CONTROLROD_DATABASE_URL` (use your own Postgres instead of the embedded one), `CONTROLROD_EGRESS_FILTER` (outbound egress filtering for real author runs is **on by default**; set `0` or `false` to disable), `CONTROLROD_GUIDED_PREPARATION=1` and `CONTROLROD_PREPARED_RELEASE=1` (turn on guided preparation and prepared release, both off by default). The step-by-step owner run is in [owner-pilot.md](owner-pilot.md).

**Agents run for real.** `pnpm cr start` also starts the daemon, which launches Claude Code or Codex processes under your login, inside the sandbox policy recorded for the run ([ADR 0021](adr/0021-native-cli-sandboxes.md)). If you only want the API and web app, see the pilot guide for starting the API alone.

## Dev container and Codespaces

**For contributors only.** This is a place to build and test Control Rod's code, not the way to try it. To use Control Rod, install it on your own machine as above.

`.devcontainer/` describes an Ubuntu 24.04 environment with Node 22, pnpm, Go, Python, uv and Rust at the pinned versions. Open the repository in GitHub Codespaces, or in VS Code with the Dev Containers extension (**Reopen in Container**). Setup installs dependencies and builds everything (a few minutes on first build); then run `pnpm cr start`.

- In VS Code the app is at <http://localhost:7300> through port forwarding, same as on your own machine.
- In Codespaces the app is at a forwarded `https://<name>-7300.app.github.dev` address. `pnpm cr start` detects Codespaces and sets the passkey origin to match. A passkey is bound to the address it was created on, so one made in a Codespace does not work anywhere else, and the data goes when the Codespace is deleted. Treat it as a place to build and test, not to keep real records.
- Agent runs need Claude Code signed in inside the container (`npm i -g @anthropic-ai/claude-code`, then `claude`). The agent sandbox is bubblewrap, and a container often stops bubblewrap from creating the user namespace it needs. `pnpm cr doctor` tests this and says so; when it fails, the preflight refuses agent runs with the reason. Expect the container to be fine for the web app, the API, and all the tests, and use a Linux machine, a Mac or WSL2 for real agent runs.
- The configuration was checked by running its setup script on a fresh clone as a non-root user and starting the app with Codespaces-style variables. The container image itself has not yet been built by anyone, so report anything that breaks.

## Check your change

These mirror the CI jobs in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Run the ones for the area you touched.

| Area | Commands |
| --- | --- |
| TypeScript (API, web, spec) | `pnpm --filter @control-rod/spec run build && git diff --exit-code -- spec/generated`, then `pnpm -r run typecheck` and `pnpm -r run test` |
| Rust (kernel) | `cargo fmt --all --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` |
| Go (daemon) | In `daemon/`: `gofmt -l .` (must print nothing), `go vet ./...`, `go test ./...` |
| Python (SDK) | In `sdk/python/`: `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest -q` |
| Web app, end to end (live) | `pnpm -C apps/web exec playwright test -c playwright.live.config.ts --project=chromium --trace off`: the real control plane, database and daemon (fake runtime) driven in a browser, with break-it and persona passes. See [apps/web/e2e/live/README.md](../apps/web/e2e/live/README.md); `tools/break-loop/loop.sh` runs the fix loop over it. Not yet in CI |
| Licences | `node tools/license-gate.mjs` |
| Lifecycle model | `bash models/generate.sh` when you change `models/` or the kernel's lifecycle; see [`models/README.md`](../models/README.md). The trace replays run in the Rust and TypeScript suites above |
| Change records (owner decisions) | `python3 tools/check_owner_decisions.py`; see [collaboration.md](collaboration.md#recording-owner-decisions). Not yet in CI |
| Instruction checks | `python3 tools/instruction_checks/run.py --list`, then a case with `--out <dir>` when you change `AGENTS.md` or a daemon prompt. Runs the real CLI on your login, so never in CI |
| Agent guide | `python3 tools/check_agents_map.py` when you change `AGENTS.md` or `CLAUDE.md`. Not yet in CI. If the guide must grow, re-record its budget with `--record` in the same change |
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
