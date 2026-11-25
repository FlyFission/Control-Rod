# Basis: Grok CLI as a confined seat

**Change slug:** `grok-seat`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Decision this basis supports:** whether Grok CLI leaves `AwaitingConfinement` on macOS and takes author, intake and checker seats.

## Mission / need

The owner (2026-11-25): "Lets work on getting antigravity working as well as grok." Antigravity shipped in `agy-seat`. This record does the same for Grok CLI, which `wave2-multi-cli-adapters` left listed but refused.

## Measured facts (Grok CLI 1.0.92, macOS, the owner's Mac Studio, 2026-11-25)

Survey notes are outside the repository (they include the owner's paths); the results that decide this change are summarized here and in [verification](verification.md).

- Headless `grok -p` has no sandbox Control Rod can configure from a policy, and Grok's own `--sandbox` refuses to start inside another Seatbelt profile. `grok agent stdio` speaks the Agent Client Protocol (newline JSON-RPC).
- Over ACP, Grok hands its shell (`terminal/create`, `wait_for_exit`, `output`, `release`), file reads (`fs/read_text_file`) and writes and edits (`fs/write_text_file`) to the client when the client offers them. `list_dir`, `grep`, web search and fetch, MCP and subagents run inside the Grok process. `grok agent` takes none of the headless tool flags.
- A session's `_meta.agentProfile.tools` allowlist removes every other tool when it names internal ids (`run_terminal_cmd`, `read_file`, `write`, `search_replace`); Grok's debug log then says `tools allowlist applied`. One unmappable entry (for example `run_terminal_command`) makes Grok keep its full toolset, silently except for a debug-log line.
- A session's `_meta["x.ai/hooks"].pre_tool_use` makes Grok call the client's `_x.ai/hooks/run` before each tool; `{"decision":"deny"}` refuses it. On a transport error or an unknown answer Grok runs the tool (fails open).
- Under an outer Seatbelt profile with network only to a local CONNECT proxy allowing grok.com, cli-chat-proxy.grok.com and api.x.ai, Grok works; its in-process `list_dir` and `grep` of a denied folder fail with Operation not permitted. It needs read access to its program and about twenty named files in `~/.grok` (auth.json among them), and writes to its sessions, logs and lock files. User hooks in `~/.grok/hooks` are not read.
- With `GROK_TELEMETRY_ENABLED=0`, `DISABLE_TELEMETRY=1`, `GROK_DISABLE_EXPERIMENTS=1` and `GROK_DISABLE_AUTOUPDATER=1`, only cli-chat-proxy.grok.com was contacted. `HOME` set to an empty folder with `GROK_HOME` kept drops every `~/.claude`, `~/.cursor` and `~/.codex` source and keeps the login.
- `grok models` exits 0 whether or not a login is present; its first line says which. Unknown arguments without a terminal run as a headless prompt with tools, so Control Rod never passes Grok an argument it has not measured.

## Scope

In scope: `daemon/internal/runner` (Grok adapter, the ACP bridge and its two Seatbelt profiles, launch-by-digest for a bridged runtime, tests), `daemon/cmd/controlrod` (the hidden `grok-bridge` command), `models.json`, `services/api/src/{runtimes,run-attestation,work,subscriptions,checker-attempts,sandbox}.ts` and tests, `docs/daemon.md`, `README.md`, and this packet. Out of scope: kernel, policies, red-team fixtures, workflows, spec, ADRs; OpenCode and Ollama; Grok in a repository checkout or with network.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The allowlist log line is written when, and only when, the allowlist is applied. | Measured both cases on 1.0.92. | A version that changes the line; only 1.0.92 is seated. |
| Grok's delegated tools reach only the client. | Measured: with the client offering terminal and fs, every shell and file call arrived as a request. | A version that runs one of them in-process. |
| Seatbelt confines the Grok process and its children. | Measured with canaries. | Any canary read in the qualification. |
| macOS only. | Nothing was measured elsewhere. | Not applicable: other platforms stay refused. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Grok CLI runs author (outside a checkout), intake and pre-check work on macOS through Control Rod's ACP bridge: Grok under a Seatbelt profile and a host-allowlist proxy, its session limited to the four delegated tools by an allowlist it confirms and a hook the bridge answers, and every command and file access under a second profile derived from the run's policy. It stays refused on every other platform, for checkout authoring and for network work; its pre-checks count with the Grok models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
