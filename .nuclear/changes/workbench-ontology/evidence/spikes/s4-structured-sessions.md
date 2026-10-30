# S-4: structured multi turn sessions until ACP

**Question.** Which structured multi turn interfaces are stable in the pinned versions until ACP lands?

**Script.** `spikes/runtime-confinement/session_spike.py` (S-4 half). Raw output: [s3-s4-hooks-and-sessions.json](s3-s4-hooks-and-sessions.json), key `S-4`.

## Setup

Native Claude CLI in the S-0 model domain, scripted provider, fixture key. `-p --input-format stream-json --output-format stream-json --verbose --tools ""`. Two user messages written to stdin as JSON lines.

## Result

| Observation | Value |
|---|---|
| exit | 0 |
| provider requests | 2 |
| second request carries history | yes: `user turn 1`, `assistant done`, `user turn 2` |
| event types on stdout | `assistant`, `result` |
| result events | 1, after the last turn |

## Answer

**Claude Code stream-json input and output is a workable interim interface:** one process keeps the conversation and sends full history on each turn. Note for the Explore adapter: with both turns queued up front, only one `result` event arrives at the end, so per turn completion must be read from the `assistant` events (or turns fed one at a time after each reply).

**Codex:** not run here. `codex exec --json` gives structured events for a single prompt (seen in [S-1](s1-srt-driver.md)); its multi turn interface still needs its own check before Explore uses it.

## Limits

Scripted provider, two turns, one version. Not a soak test.

## Unblocks

The WB-17 interim path for Claude Code Explore sessions.
