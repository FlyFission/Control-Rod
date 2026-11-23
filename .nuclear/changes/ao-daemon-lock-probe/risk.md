# Quick Risk: daemon lock names its holder, and one slow probe does not take a runtime away

## Selected mode

- **Mode:** Quick
- **Why this mode:** two small daemon behaviours in `daemon/internal/runner`, no trust surface, no contract change. This is the rework of #139 (pattern `AO-6` in `docs/patterns/agent-orchestrator.md`), which failed its blind review (FIX FIRST, 6 P1).

---

## Change

- Slug: ao-daemon-lock-probe
- PR / issue: #139, reworked 2026-11-23 on branch `feat/ao-s2-daemon-worktrees`
- Owner: Ben Huffer (decision owner); reworked by Claude Code in the project thread "Rework the agent-orchestrator PRs"
- Date: 2026-11-23
- Summary: two behaviours.
  - `LockHome` writes the holder's PID into `daemon.lock` after winning the lock, and a second daemon names that PID when it refuses to start. A filesystem that cannot lock now refuses to start with a plain sentence instead of the misleading "already running".
  - When a runtime that was ready only times out on its next probe, the daemon keeps offering it for that one pass and logs it. A second timeout in a row, or any answer that says not ready (a sign-out included), takes it away at once.
- Dropped from #139: the `daemon/internal/gitworktree` manager (nothing called it; #135 binds runs to the selected worktree through the API; its review found a Destroy that could delete outside its root, missing git config hardening and a teardown that ignored cancellation), and `probe_health.go` (nothing called it; its breaker counted every non-ready runtime, so it tripped on every pass and could keep a signed-out runtime ready).

## Scope

- Affected files: `daemon/internal/runner/lock_unix.go`, `lock_unix_test.go` (new), `probe.go`, `probe_timeout_test.go` (new), `daemon.go`, and this record.
- Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes: the "already running" message names a PID; one log line when a probe is held through a timeout.
- Dependency/model/API/prompt/tool permission changed? no. `RuntimeStatus` gains an unexported field only; its JSON is unchanged.
- Release or rollback posture changed? no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A runtime whose CLI hung is offered for one more probe interval; a run started in that window fails at launch and is recorded as failed. The lock still refuses a second daemon. |
| Reversibility | Instant: revert the commit. |
| Detectability | High: unit tests for each rule; the hold logs one line each time. |
| Exposure | Daemon internals on Linux and macOS. |
| Uncertainty | Low. |
| Why Quick is enough | No trust surface, contract, dependency or public claim changes. |

## Required proof

- Command/check/eval to run: four checks.
  - `cd daemon && go test -race ./internal/runner -run 'TestASecondDaemon|TestANewHolder|TestAHomeThatCannot|TestOneDaemonPerHome|TestAProbeThatRanPast|TestOneSlowProbe|TestTheDaemonOffersOnlyReadyRuntimes|TestProbe' -count=1`
  - `cd daemon && go test ./internal/runner -count=1`, compared with the same run on `origin/main`
  - `python3 tools/check_originality.py`
  - `git diff --check origin/main`
- Expected result: the targeted tests pass; the full runner suite fails on exactly the tests that fail on `origin/main` on the same host; originality passes; no whitespace errors.
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the paths in Scope.
- Stop condition: any edit outside Scope, or a runner test that passes on `origin/main` and fails here.

## Escalation check

Move up to Standard if this change touches a trust surface or confinement rules. It does not.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- The checks in Required proof pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [home lock](../../../daemon/internal/runner/lock_unix.go), [probe](../../../daemon/internal/runner/probe.go), [daemon probe pass](../../../daemon/internal/runner/daemon.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
