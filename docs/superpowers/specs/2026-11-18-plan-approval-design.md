# Plan approval in runs: design

**Status:** proposed, for owner review. No product code.
**Date:** 2026-11-18
**Source idea:** pattern PL4 in [`docs/patterns/plannotator.md`](../../patterns/plannotator.md).
**Change record:** [`.nuclear/changes/plan-approval-and-anchors/`](../../../.nuclear/changes/plan-approval-and-anchors/)

## 1. Intent

A person should be able to read and approve an agent's plan before the agent changes anything. The approval should be a signed record bound to the exact plan, not a chat turn. Notes on a plan should point at the part they are about.

## 2. What the spike found

Plannotator hooks Claude Code's `PermissionRequest` for `ExitPlanMode` in interactive sessions. Control Rod runs Claude Code headless (`claude -p`, ADR 0020) under its sandbox (ADR 0021). A spike on 2026-11-18 with Claude Code 2.1.327 on Linux, recorded in the change record's [evidence](../../../.nuclear/changes/plan-approval-and-anchors/evidence/01-print-mode-hook-spike.txt), found:

1. **`ExitPlanMode` does not exist in print mode.** Under `-p --permission-mode plan` it is not in the session's tools. The agent wrote its plan to a file in its home folder and said it could not exit plan mode. No hook fired. Plannotator's mechanism cannot work in Control Rod's runs.
2. **`PermissionRequest` fires in print mode,** with the tool name and input on stdin. This matches the daemon's existing record-only hook (spike S-3, `daemon/internal/runner/runtime.go`).
3. **The hook's answer is honoured in print mode.** `deny` with a message refused the tool, and the message reached the agent as the tool result. `allow` let the tool run and the file was written. Today the daemon's hook returns nothing, so the tool is refused. That is why the code calls it a record of refusals, "not an approval channel". It could be one.
4. **A denial message is information to the agent, not an order.** Told "write the word bye instead", the agent declined because it conflicted with its task. Feedback wording needs testing (pattern PL5).

The spike ran on one version, one platform, under this session's login. It does not qualify any invocation under ADR 0021.

## 3. Options

**A. Plan run, then work run (recommended first).**
1. A planning run starts in `--permission-mode plan` with read-only tools. Its final message is the plan. The daemon uploads it as an artifact with its digest.
2. The plan appears in the Inbox. The person approves it with a passkey assertion over its digest, or returns it with notes anchored to its sections (PL3 `section` anchors).
3. The work run receives the approved plan and its digest in its brief. The run record names the digest, so the evidence shows which plan the work followed.

This fits one-shot print-mode runs, keeps every decision a signed human act, and needs no hook with authority.

**B. Hook-mediated tool approval.**
The daemon's `PermissionRequest` hook asks the daemon over a local channel. The daemon asks the control plane, waits for a signed decision, and answers `allow` or `deny`. The spike shows the channel works, but it holds a run open while a person decides. That interacts with leases, timeouts and budgets. It also gives the hook command authority over what the agent may do, which is an agent-authority surface. Keep it for gating specific tools later, after its own spike on leases and timeouts.

## 4. Where it lands (option A)

| Area | Change | Gate |
|---|---|---|
| Daemon | Planning run mode: plan permission mode, read-only tool list, plan text captured as an artifact | Agent-authority surface: owner gate. ADR 0021 qualification of the planning invocation |
| `spec/` | Plan record (digest, package, run), plan decision; plan notes use `AnchoredQuote` (spec/anchors.tsp) | Additive; owner approves the contract |
| API | Plan record, Inbox item, signed approve and return; notes checked by `services/api/src/anchors.ts` | Standard change record |
| Kernel | Whether a work claim on a package that requires a plan must cite an approved plan digest | Kernel decision function: owner signature |
| Web | Plan view with section notes and signed decision | After the board work it depends on |

## 5. Slices

| Slice | Delivers | Depends on |
|---|---|---|
| P1 Planning run | Daemon planning mode, plan artifact and digest, fixture tests with a fake CLI, qualification of the invocation | none |
| P2 Plan review | Plan record and migration, Inbox item, anchored notes, signed approve and return | P1, PL3 contract approved |
| P3 Bound work run | Work run brief carries the approved plan; run record names its digest; kernel floor if the owner signs it | P2 |
| P4 Tool approval (option B) | Spike on leases and timeouts, then hook-mediated approval for chosen tools | P3, owner decision |

## 6. Open owner decisions

1. Option A first, with B later, or B now?
2. Which packages require a plan: every package, a rigor mode and above, or opt-in per package?
3. Should "work follows an approved plan" be a kernel floor (signature needed) or a control-plane check?

## 7. Not claimed

- That any planning invocation is qualified under ADR 0021.
- That the spike's behaviour holds on other Claude Code versions or platforms, or for Codex. Codex `exec` has no equivalent hook (openharness note H4).
- That a plan approval proves the work is right. It records what a person agreed to before work started.
