# ADR 0020: The MVP daemon runs agents in headless print mode; ACP is deferred

- Status: Accepted for the MVP; amends ADR 0011 until ACP sessions land
- Date: 2026-10-22

## Context
ADR 0011 says Control Rod is the ACP client for every agent session. The MVP daemon does not do that. It starts Claude Code as `claude -p ... --output-format stream-json` and Codex as `codex exec --json`, gives each one prompt, and reads its event stream until it exits (`daemon/internal/runner/runtime.go`, `docs/daemon.md`). There is no ACP client in the daemon.

## Decision
For the MVP, every run is a headless print-mode run. The execution trace says so: `runtime_mode` is `print` (or `fake` for the test runtime), with the requested model, the model the runtime reported in its own stream, the permission mode, the tool allowlist and the sandbox the daemon asked for. ACP sessions are deferred to the phase that brings the sandbox driver.

## Conditions
1. In print mode no ACP permission binding is in force. Nothing asks Control Rod before a tool runs, and ADR 0011 conditions 2 and 5 do not apply yet.
2. The only fences are the tool allowlist (Claude Code `--allowedTools` with `--permission-mode acceptEdits`), the Codex `workspace-write` sandbox rooted at the run workspace, the stripped environment, and the run timeout. Claude Code runs have no sandbox from the daemon.
3. The trace records what ran. When a run names a model and the runtime reports a different one, the control plane appends a `run.model-mismatch` event.
4. No document, page or record may say a run was ACP-gated while `runtime_mode` is `print`.

## Alternatives considered
Building the ACP client first. It is the right end state, but it would hold back the owner's first real run for work that the sandbox driver needs anyway.

## Consequences
The first real runs are simpler to start and to debug. Agent actions are known only from the stream and the outputs afterwards, never approved before they happen. Moving to ACP changes `runtime_mode` and must bring ADR 0011's conditions back into force.

## Evidence
`daemon/internal/runner/runtime.go` (`ClaudeArgs`, `CodexArgs`, `LaunchFor`); `daemon/internal/runner/launch_test.go`; `services/api/test/runs.test.ts` ("what actually ran"); build plan item N8 and claims K06 and K09 in the Kandev pattern notes.
