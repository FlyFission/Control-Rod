# S-0: capability separation per pinned runtime

**Question.** For each pinned native runtime, can model transport be separated from every executable tool, with builtin bypasses disabled?

**Script.** `spikes/runtime-confinement/broker_spike.py`. Raw output: [s0-capability-separation.json](s0-capability-separation.json), negative control: [s0-capability-separation-weakened.json](s0-capability-separation-weakened.json).

## Setup

Two bubblewrap domains with nothing shared but two Unix sockets:

- **M (model domain).** The real native Claude CLI. No network namespace, no owner home, only a fixture API key. Its only routes out are `/sock/provider.sock` (to a scripted Messages provider on the host) and `/sock/broker.sock` (to a tool broker), forwarded to loopback ports inside M.
- **T (tool domain).** Where every tool actually executes: cleared environment, no network, no sockets, no owner home.

The CLI runs with `--tools ""` (no builtins), `--strict-mcp-config` with one MCP streamable HTTP server (the broker) exposing `mcp__broker__probe`, and `--setting-sources ""`. The scripted provider first asks for the builtin `Bash` tool, then for the broker tool.

## Result

| Check | Normal run | Weakened control (`--weaken`: T gets the network and the key) |
|---|---|---|
| client_finished | pass | pass |
| only_broker_tool_advertised | pass | pass |
| builtin_tool_refused | pass | pass |
| broker_tool_executed_in_T | pass | pass |
| tool_has_no_credentials | pass | **fail (expected)** |
| tool_cannot_reach_model_transport | pass | pass |
| tool_has_no_internet | pass | **fail (expected)** |
| tool_cannot_see_owner_home | pass | pass |
| model_domain_has_no_internet | pass | pass |
| model_domain_cannot_see_owner_home | pass | pass |
| provider_saw_only_fixture_key | pass | pass |

The control proves the checks can fail: weakening T trips exactly the two checks it should and no others.

## Answer

**Claude Code 2.1.314: yes.** With builtins disabled and a strict MCP config, the CLI advertises only the broker tool, refuses the builtin when the model asks for it, and every tool call executes in T, which holds no credential and cannot reach the model transport.

**Codex 0.166.0: not established.** No stable switch was found that disables Codex's built in shell tool, so tool execution cannot be moved out of the model domain the way it can for Claude Code. Until that changes, Codex stays unavailable for confined lanes unless its own sandbox is qualified as the tool boundary (see [S-5](s5-nesting.md) and [S-1](s1-srt-driver.md), which show that sandbox enforcing, but inside the same domain as the model client).

## Limits

One host (WSL2), scripted provider, fixture key. It shows the mechanism works at these versions; a version bump can change the tool surface, so the daemon must re-run this check per pinned version (WB-12).

## Unblocks

WB-15 design for Claude Code lanes: model client in M, tools in T through the broker. Codex confined lanes remain blocked.

## Rerun

`python3 spikes/runtime-confinement/broker_spike.py --claude <native claude>` and again with `--weaken`.
