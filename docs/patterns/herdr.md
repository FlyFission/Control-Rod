# Pattern notes: herdr

> **Provenance.** Written on 2026-11-23 from herdr's public README at commit `e8d7d9705a7a2c89cef4dd42079379f05685af87` (https://github.com/herdrdev/herdr) and from the titles and labels of its public issues, pulled by `docs/research/user-demand-2026-11/repos/pull.py`. herdr is Apache-2.0, so the clean-room split is not required, but this file still records ideas only: no herdr code, configuration or documentation text is copied. Short phrases in quotation marks are herdr feature names. Its source code was not read.

In our words: herdr is a single Rust program that hosts the terminal sessions coding agents run in. A background process keeps those sessions going, agents can call it from scripts, and the agents themselves are left unchanged.

## Why it matters to Control Rod

ADR 0024 makes the agent table the product, with live terminals in each task window. A hypothesis for the spike, not a finding: owning a terminal layer is costly. In the 2,997 herdr issue titles captured on 2026-11-23, 1,321 match terminal, TUI or rendering keywords and 293 carry the `input` label; `remote` (221) and `agent-detection` (169) are the other large labels. Keyword matches over-count, and issue volume also tracks popularity, so the spike should measure the cost directly.

## Patterns

| # | What herdr does | Our version | Fit, effort |
|---|---|---|---|
| 1 | Closing the window or losing an SSH link does not end the sessions, and after a reboot the layout returns and some agents pick up where they left off. | The daemon holds each task's terminal; closing the app or losing the network never stops a run. | Adapt, M |
| 2 | The local machine and remote machines reached over SSH appear together, with one list of agents across them, and each machine reconnects on its own. | Remote daemons over SSH (ADR 0024 decision 5) show in the same board, each with its own connection state. | Adapt, M |
| 3 | Each pane carries a status for the agent inside it, so a person can see which agent is waiting on them. | The board's Needs you, Working and Done groups come from agent state, not from typed status. Hypothesis to test: its 169 issues labelled `agent-detection` suggest preferring agent hooks over reading the screen where a CLI offers hooks. | Adopt, S to M |
| 4 | Agents can control it from a command line or a local socket, for example opening a pane or handing a prompt to another agent. | Seats at the table hand work to each other through Control Rod's API, recorded on the card. | Adapt, M |
| 5 | Runs any agent CLI by owning its terminal, not by plugging into the agent. | Adapters own the process and terminal, so an upstream agent update cannot remove Control Rod. Hypothesis to test: plugging into an agent instead breaks on its updates; 904 captured oh-my-openagent issue titles (a plugin for opencode) match install or upgrade keywords (`repos/counts.json`). | Adopt, already the adapter model |
| 6 | Works equally well from the keyboard (tmux-style prefix keys) and the mouse. | Matches the keyboard grammar in the plan; keep mouse equal. | Already planned |
| 7 | One binary, install by one command on macOS, Linux and Windows. | One-command install stays a release 1 exit. | Already planned |

## Build-on question for the owner

Because herdr is Apache-2.0, Control Rod could run its live terminals on herdr instead of writing a terminal layer. ADR 0024 asks for a spike before deciding, because ADR 0019 chose an own workbench and any borrowed code needs a register row (`docs/third-party/register.md`). The spike should answer: does herdr's socket API expose pane state and input without its UI; does it run under Control Rod's sandbox launch; and what does it add to install size.
