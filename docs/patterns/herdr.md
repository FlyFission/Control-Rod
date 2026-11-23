# Pattern notes: herdr

> **Provenance.** Written on 2026-11-23 from herdr's public README at commit `e8d7d9705a7a2c89cef4dd42079379f05685af87` (https://github.com/herdrdev/herdr) and from the titles and labels of its public issues, pulled by `docs/research/user-demand-2026-11/repos/pull.py`. herdr is Apache-2.0, so the clean-room split is not required, but this file still records ideas only: no herdr code, configuration or documentation text is copied. Short phrases in quotation marks are herdr feature names. Its source code was not read.

herdr calls itself a runtime for coding agents: one Rust binary that owns the terminals agents run in, keeps them alive in a background server, and lets agents drive it through a CLI and a socket. It does not wrap or replace the agents.

## Why it matters to Control Rod

ADR 0024 makes the agent table the product, with live terminals in each task window. Of herdr's 2,997 issues, 1,321 match terminal, TUI or rendering keywords, and 293 carry the `input` label. That is what a terminal layer costs to own. Its other heavy labels are `remote` (221) and `agent-detection` (169).

## Patterns

| # | What herdr does | Our version | Fit, effort |
|---|---|---|---|
| 1 | Terminals keep running in a background server when the window closes or SSH drops; layout and supported agent sessions come back after a restart. | The daemon holds each task's terminal; closing the app or losing the network never stops a run. | Adapt, M |
| 2 | Local and saved SSH machines in one window, with one combined agent list and separate reconnects. | Remote daemons over SSH (ADR 0024 decision 5) show in the same board, each with its own connection state. | Adapt, M |
| 3 | Every pane is marked working, blocked or idle, and it says when an agent needs an answer. | The board's Needs you, Working and Done groups come from agent state, not from typed status. Its 169 agent-detection issues say to prefer agent hooks over screen reading where a CLI offers them. | Adopt, S to M |
| 4 | Agents drive it through a CLI and socket: start panes, prompt each other, wait until another agent is blocked. | Seats at the table hand work to each other through Control Rod's API, recorded on the card. | Adapt, M |
| 5 | Runs any agent CLI by owning its terminal, not by plugging into the agent. | Adapters own the process and terminal, so an upstream agent update cannot remove Control Rod. oh-my-openagent, which plugs into opencode, has 904 issues matching install or upgrade breakage (`repos/counts.json`). | Adopt, already the adapter model |
| 6 | Keyboard prefix keys and mouse are both first class. | Matches the keyboard grammar in the plan; keep mouse equal. | Already planned |
| 7 | One binary, install by one command on macOS, Linux and Windows. | One-command install stays a release 1 exit. | Already planned |

## Build-on question for the owner

Because herdr is Apache-2.0, Control Rod could run its live terminals on herdr instead of writing a terminal layer. ADR 0024 asks for a spike before deciding, because ADR 0019 chose an own workbench and any borrowed code needs a register row (`docs/third-party/register.md`). The spike should answer: does herdr's socket API expose pane state and input without its UI; does it run under Control Rod's sandbox launch; and what does it add to install size.
