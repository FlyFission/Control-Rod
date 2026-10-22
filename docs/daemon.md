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

The daemon offers the runtimes it finds on `PATH`:

- `claude`: Claude Code, run as `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools <list>`. The tool list comes from `inputs/TOOLS.txt`, one per line, or defaults to `Read,Write,Edit,Glob,Grep,Bash(cr-site:*),WebSearch,WebFetch`.
- `codex`: `codex exec --json -s workspace-write --skip-git-repo-check -C <workspace> [-m <model>] <prompt>`. Codex runs read-only by default and refuses to start outside a Git repository; run workspaces are not repositories, so the daemon asks for a sandbox that may write only inside the run workspace and skips the repository check. Checked against `codex exec --help` on Codex 0.163.0.
- `fake`: test runtime. Runs `inputs/FAKE.sh` with bash, or copies `inputs/FAKE_OUT/*` into `out/`.

### Network inside the Codex sandbox

The Codex sandbox has no network unless the job asks for it. A job asks by putting the line `network: on` in `inputs/TOOLS.txt`; the daemon then adds `-c sandbox_workspace_write.network_access=true`. The line is a directive for the daemon and is never passed to a runtime as a tool name. Any other `network:` value means no network.

The control plane writes the line only for author runs of roles whose tools file asks for it. Today those are `site-parcel` and `site-constraints` (`packs/capital-projects/site-concept/roles/<role>.tools.md`), because `cr-site parcel` and `cr-site constraints` query public GIS services. Pre-check runs never get it, and neither do intake or roles without a tools file. Claude Code runs have no sandbox from the daemon in the MVP, so the line changes nothing for them; their fence is the tool allowlist.

Codex loads the owner's own Codex configuration (the agent keeps `HOME`), which can change these defaults. Run one real Codex author and pre-check on the Mac before trusting Codex with real work.

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
