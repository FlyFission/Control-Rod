# Risk: replace repository-defined filter drivers in host-side git

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instruction to close out the open items.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec version. `daemon/` is not a trust surface (CODEOWNERS).
- Scope: `daemon/internal/runner/git_host.go`, `git_host_test.go`, and the register row in `docs/third-party/register.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A filter driver from repository config runs on the host during a host-side checkout, status or add. | Repository-scope filter variables are pinned on the command line to the host user's definition or emptied; `required` pinned false. Tests for `.git/config`, `include.path` and `config.worktree` with marker commands; pins shown to matter by mutation M1, M4. | Any marker written in those tests. |
| R-02 | The host user's own driver (for example git-lfs installed globally) stops working. | A repository variable is replaced by the global or system value of the same variable, not emptied, when one exists (HG-02, mutation M5). | Global definition not used in the test. |
| R-03 | The repository config changes under the command (an agent writes it mid-run) so the pins no longer match. | After-run listing compares repository filter entries; any change fails the command with `ErrRepoConfigChanged` (HG-03, mutation M2). Not a lock: a command can still run with a driver added after the pins were read; the failure is reported, not prevented. | A changed filter entry that the check does not report. |
| R-04 | Known gap: other repository-config commands are not refused. Upstream refuses an include or any key outside an allowlist (for example `core.sshCommand`, `diff.<x>.textconv`, `credential.helper`, `remote.<x>.uploadpack`) before running anything; this port does not. | `HostGitArgs` still pins hooks, fsmonitor, pager, ext transport, submodule recursion and signing. `HostGitCommand` has no callers, and whether a run can write repository config depends on the runtime mounts. Named in `ship.md` as follow-up. | A caller added for a repository an agent can write, before the policy is ported. |
| R-06 | A filter driver name the pins cannot address. git splits `-c` at the first "=", so `-c filter.a=b.smudge=` sets `filter.a` and leaves driver `a=b` in effect (Codex review on PR #104; reproduced with git 2.43.0). | Such a name in repository scope refuses the command before git runs (HG-05, mutation M7). | A repository driver left in effect by a pin. |
| R-07 | A valueless trusted `required` (true to git) pinned as the empty value (false), so a failing trusted filter is no longer enforced (Codex review on PR #104). | Valueless trusted entries pinned as `true` (mutation M8). | A trusted boolean weakened by its pin. |
| R-05 | Signature change breaks callers. | No callers on `main`; `go vet ./...` for linux, darwin and windows. | A build failure. |

## Selected mode

- **Mode:** Standard
- Basis: host-side git hardening in the daemon, no current callers, reversible by reverting one commit; no schema, contract or persisted data change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

HG-01 to HG-05 are implemented with tests, each control is shown to matter by mutation, and the daemon suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
