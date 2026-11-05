# Run daemon

`controlrod daemon` runs agent work on your own machine. It claims jobs from the control plane, runs an agent runtime in a per-job workspace, streams a log and reports outputs with an execution trace. It never makes a decision: releasing and accepting work belong to people, through the control plane and its kernel.

## Run it

```sh
cd daemon && go build -o ../bin/controlrod ./cmd/controlrod
CONTROLROD_API=http://localhost:7300 ./bin/controlrod daemon --parallel 3 --timeout 45m
```

| Setting | Default | Meaning |
|---|---|---|
| `CONTROLROD_API` | `http://localhost:7300` | Control plane address |
| `CONTROLROD_DAEMON_TOKEN` | contents of `~/.controlrod/daemon.token` | Bearer token for the runner API |
| `CONTROLROD_HOME` | `~/.controlrod` | Home for the token file and workspaces |
| `CONTROLROD_ALLOW_FAKE` | unset | `1` offers the fake test runtime; never set it on a real machine |
| `--parallel` | 3 | Jobs run at once |
| `--timeout` | 45m | Longest a single run may take; the whole process group is killed after it |

SIGINT or SIGTERM stops claiming, gives running jobs 30 seconds, then kills them and reports each as failed with `daemon shutdown`. A completion that cannot be sent before the daemon exits stays in the outbox and is sent at the next start.

## Runtimes

The daemon finds runtimes on `PATH` and offers those that pass the probe below:

- `claude`: Claude Code, in headless print mode under the run's sandbox policy (see "Sandbox" below).
- `codex`: `codex exec --json --skip-git-repo-check -C <workspace> [-m <model>] <prompt>`, with the run's permission profile (see "Sandbox" below). Run workspaces are not Git repositories, so the repository check is skipped.
- `fake`: test runtime. Runs `inputs/FAKE.sh` with bash, or copies `inputs/FAKE_OUT/*` into `out/`. It runs no agent CLI and takes no sandbox.

`controlrod sandbox-args --runtime claude|codex --policy <file> --workspace <dir>` prints exactly the argument list and environment a run would get under a policy, and runs nothing.

### Runtime probe

Finding a binary on `PATH` is not enough. At start and every 5 minutes the daemon probes each runtime it found, without signing in and without any credential:

- `<runtime> --version` must answer with exit 0;
- for Codex, when `codex login --help` lists a `status` subcommand, `codex login status` must exit 0;
- the sandbox preflight below must pass.

A runtime that fails is not offered for work, and the daemon logs why in one plain sentence with the fix. Every claim carries the probe result for each runtime, the control plane picks only runtimes reported ready, and the office lists any runtime that is not ready with its reason. The daemon never runs `claude login`, `codex login` or any other sign-in.

### Sandbox (ADR 0021; plan tasks 6.1 to 6.3)

Every job carries the sandbox policy its run is recorded under, with its digest. Before starting an agent CLI the daemon checks the policy's canonical digest against both the job and the run's record, and refuses the run if anything is missing or differs; it never starts an agent CLI unsandboxed. Each CLI keeps the owner's ordinary login: Control Rod never reads, copies or relays a token, and never writes the owner's own CLI settings.

From the policy alone the daemon builds:

- **Claude Code**: `--tools` names only the policy's tools (Bash, Read, Edit, Write, Grep, Glob; web, task and notebook tools are not qualified and never enabled), and `--allowedTools` the role's own list from `inputs/TOOLS.txt`, less any unqualified tool. `--restricted` confines the file tools to the workspace; `--strict-mcp-config` with an empty `--mcp-config`, `--setting-sources ""`, `--disable-slash-commands` and `--no-session-persistence` keep out every MCP server, user or project setting, hook, plugin, memory file and skill the run did not declare. `--settings` turns the command sandbox on with `failIfUnavailable` and no unsandboxed retry, blocks reads outside the workspace for commands and file tools alike (`permissions.blockReadsOutsideWorkingDirectories`), names the denied paths again as rules, and allows network only to the policy's hosts.
- **Codex**: launched from its verified install tree staged, content addressed and re-hashed, into a private folder under the system temporary folder (`controlrod-runtimes-<uid>`), because Codex re-runs its own executable inside its sandbox and the home folder is denied whole; `--ignore-user-config`, `--ignore-rules` and `--ephemeral`; a permission profile passed as `-c` overrides that extends `:workspace` and denies the denied paths, the home folder and the daemon's home whole (the workspace inside them stays usable; any login folder moved elsewhere by `CODEX_HOME` or `CLAUDE_CONFIG_DIR` is denied too), keeps `/tmp` read only and turns network off; `approval_policy="never"`; only the core environment for commands; and `--disable` for every Codex feature that could act outside the command sandbox (browser and computer use, apps, plugins, hooks, memories, multi agent and the rest). `sandbox_mode` is never set, because Codex ignores a permission profile whenever it is.
- **Environment**: an agent CLI receives only `HOME`, `USER`, `LOGNAME`, `SHELL`, `PATH` (less entries on WSL's Windows drives), `LANG`, `LANGUAGE`, `LC_*`, `TZ`, `TERM`, `TMPDIR`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `NO_COLOR` and `COLORTERM`: no provider, cloud or proxy credentials, and no sockets.

**Network.** A role that needs network names the hosts in its tools file, `network: host, host`. The control plane allows them only for public or internal work of general-service grade; otherwise the run waits with the reason. Only Claude Code can limit an agent's network to named hosts, so such a run is never given to Codex. Today `site-parcel` and `site-constraints` name the public GIS hosts `cr-site` queries; pre-check and intake runs never have network.

**Preflight.** With every probe, the daemon checks that the sandbox can hold, and says how to fix it when it cannot:

- on Linux and WSL2, bubblewrap (`sudo apt install bubblewrap`), and for Claude Code socat (`sudo apt install socat`), on the agent's `PATH`;
- the CLI is signed in (`claude auth status`, `codex login status`); the fix is the CLI's own `claude login` or `codex login`;
- no managed Codex configuration (any TOML file in `/etc/codex`) mentions `sandbox_mode` in any spelling, naming the line to remove; a managed file that cannot be read refuses too;
- every feature the installed Codex leaves on, with Control Rod's switches applied and no user configuration, is one Control Rod has qualified. A new Codex version that turns on anything else is refused until it is qualified.

Before each launch the host checks run again without running the CLI, so nothing executes a CLI that has not yet been checked against its pin, and the launched artifact must be the one the last probe passed: a pinned version installed after the probe waits for the next probe.

**Platforms.** On WSL2 with Claude Code 2.1.318 and Codex 0.166.0, the launch passed a qualification against a scripted provider with positive and weakened controls, and a live session with the owner's login in which each CLI was refused a decoy outside the workspace (`spikes/runtime-confinement/launch_qualification.py`, `live_login_check.py`; evidence in `.nuclear/changes/workbench-ontology/evidence/phase6/`). That is not yet the protected qualification suite of plan task 6.4. macOS and native Linux are not yet qualified; the in-run attestation of plan task 6.5 is what makes each run prove its own sandbox.

### Pre-check runtime

The control plane never hands a pre-check to the runtime that authored the work. When the daemon offers only the author's runtime, the pre-check stays queued with the reason "Waiting for an independent runtime: install Codex, or proceed with a recorded owner override." and shows in the office. The owner can proceed by writing why and signing the override with a passkey, the same way as a decision: the server derives the challenge from the digest of the package id, revision, run id, the words `override-independence` and the reason, and consumes it once. The kernel allows the override only as a signed human act with a reason. It is recorded as an event with the assertion, and the pre-check record shows a shared runtime with that override. The daemon can never make it. Runtime identity is the provider and the model (the model the runtime reported, else the one asked for), and both are recorded. The same provider counts as the same runtime whatever the models: Opus checking Sonnet's work still needs the override. The kernel refuses a pre-check on the author's provider without the override.

A run's provider picks the runtime (`anthropic` or `claude`, `openai` or `codex`, `fake`). A job for a runtime this machine lacks fails at once without creating a workspace.

## Workspace

Each job gets `~/.controlrod/work/<package>/r<revision>/<role>-<round>-<run>/` with `inputs/` written from the job and `out/` for deliverables. Input names that would land outside `inputs/` refuse the whole job before anything is written. The only prompt the agent receives is: "Read inputs/BRIEF.md and do exactly what it says. Write every deliverable into out/."

The agent's environment has every `CONTROLROD_` variable removed, so it never sees the token or the API address.

## What it reports

- **Log:** raw stdout and stderr lines (stderr prefixed `[stderr] `) about once a second, with a label the daemon derives from event types only, such as `Edit: report.md`, `Run: cr-site`, `Fetch: hazards.fema.gov`, `Search` or `Finishing`. Labels are built from tool names and short plain tokens (a file basename, a host, a command's first word, at most 120 characters), never from model prose.
- **Completion:** every regular file under `out/` (20 MB per file, 100 MB in total; symlinks fail the run), an `ExecutionTrace` with SHA-256 digests of every input and output, the runtime name and its `--version`, start and finish times, and what ran: `runtime_mode` (`print` for every real run today, see ADR 0020), the requested model (`default` when the run names none), the model the runtime reported in its own stream, the permission mode, the tool allowlist and the sandbox. When a run names a model the daemon passes it (`--model` for Claude Code, `-m` for Codex). The control plane names `default` today, so the runtime's own default is used and the reported model is the record of what ran. An intake run attaches `out/package.json`; a pre-check run attaches `out/verification.json`.

## Run custody

- **Claim:** each claimed run comes with a claim token and a lease (90 seconds by default). The daemon presents the token on every log post and on the completion; a post with another token is refused.
- **Heartbeat:** every log post renews the lease. When the agent is quiet the daemon still posts an empty batch at the heartbeat interval the control plane gives it (a third of the lease).
- **Lost:** if the lease lapses (the daemon died, slept or lost its network), the control plane marks the run `lost` with the reason, shows it in the office, and requeues nothing on its own. Only the owner can requeue it, from the package view. A log post for a run that is no longer running gets a refusal, and the daemon then ends the agent process.
- **Completion and outbox:** the daemon writes each completion to `~/.controlrod/outbox/<run>.json` (owner read-only) with a key chosen once, then posts it. A network error, 408, 429 or a server error is retried with the same key, waiting 1 second and doubling up to 30 seconds; after six tries it waits in the outbox, which the daemon retries every 30 seconds and at start. A repeat with the same key gets the stored receipt back. Any other refusal is final: the file moves to `outbox/refused/` as evidence and is not sent again.
- **Stop:** the owner can stop a run from the package view. A queued run stops at once. For a running run the request is recorded first (`run.stop-requested`); the daemon learns it from the reply to its next log post or heartbeat, kills the process group, and completes the run as `stopped`. The run shows as stopping until then, which can take up to one heartbeat interval. Asking again changes nothing. A stopped run never moves its package; the owner can requeue it, or return or reject the package.
- **Refusals while applying a completion** (an unsafe output name, an invalid trace, a pre-check with no outcome, intake with nothing to show, a kernel refusal) leave the run `failed` with the reason on the record, and the receipt says so. An invalid trace is never dropped silently.

## Tests

`go test ./...` runs a fake control plane and the fake runtime: workspace layout, path-escape refusal, label derivation from a recorded stream, output and trace digests, schema validation of the trace and verification record against `spec/generated/json-schema`, timeout and process-group kill, graceful shutdown, and checks that the token never reaches the agent, the logs or a request body.
