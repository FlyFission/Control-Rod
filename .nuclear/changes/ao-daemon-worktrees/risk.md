# Quick Risk: Hardened gitworktree manager, PID-diagnostic home lock, and probe health breaker

## Selected mode

- **Mode:** Quick
- **Why this mode:** Self-contained Go daemon additions (`daemon/internal/gitworktree/*`, `daemon/internal/runner/lock_unix.go`, `daemon/internal/runner/lock_other.go`, `daemon/internal/runner/probe_health.go`, and unit tests) with no edits to CODEOWNERS-protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`), no external dependencies, and backwards-compatible `LockHome` semantics.

---

## Change

- Slug: ao-daemon-worktrees
- PR / issue: Slice 2 on branch `feat/ao-s2-daemon-worktrees` (`#118`, `#119`, `#120`)
- Owner: Ben Huffer (decision owner); implemented by subagent for Slice 2
- Date: 2026-11-22
- Summary: three daemon hardening deliverables implementing `AO-1`, `AO-2`, `AO-3`, `AO-4`, and `AO-6`.
  - Add `daemon/internal/gitworktree/` providing hardened git worktree management (`Create`, `Destroy` with per-repo teardown lock, `O(1)` `.discarded/` rename, post-rename cleanliness check with undiscard rollback, async unlink, and `SweepDiscarded`), `os.OpenRoot`-confined `0500` permission repair (`RepairRemovePermissions`, `RemoveAllWithRetry`), orphan worktree move-aside vs. fail-closed `ErrPathOccupied`, stale `initializing` lock lifting vs. operator lock preservation, authoritative `DefaultBranchResolver` (`ErrUnresolved`), and secret-free `ClassifyGitFailure` vocabulary, plus tests in `gitworktree_test.go`.
  - Upgrade `daemon/internal/runner/lock_unix.go` (and `lock_other.go`) to add `LockHomeWithWait(ctx, home, wait)` with bounded contention retries, post-lock holder PID writing via `O_RDWR` (without `O_TRUNC`), holder PID reporting on contention, backwards-compatible `LockHome(home)`, and fail-closed `errors.ErrUnsupported` handling.
  - Add `daemon/internal/runner/probe_health.go` and `probe_health_test.go` with `ProbeOutcome` (`ProbeReady`, `ProbeDead`, `ProbeFailed`), `BootBarrier` (`StartAfter`), and `MassFailureBreaker` (trips when >=50% of >=5 runtimes fail in a single pass).

## Scope

- Affected files/configs/docs: 14 paths.
  - `daemon/internal/gitworktree/default_branch.go` (new)
  - `daemon/internal/gitworktree/failure_cause.go` (new)
  - `daemon/internal/gitworktree/git.go` (new)
  - `daemon/internal/gitworktree/manager.go` (new)
  - `daemon/internal/gitworktree/nofollow_other.go` (new)
  - `daemon/internal/gitworktree/nofollow_unix.go` (new)
  - `daemon/internal/gitworktree/remove.go` (new)
  - `daemon/internal/gitworktree/gitworktree_test.go` (new)
  - `daemon/internal/runner/lock_unix.go` (updated)
  - `daemon/internal/runner/lock_other.go` (updated)
  - `daemon/internal/runner/probe_health.go` (new)
  - `daemon/internal/runner/probe_health_test.go` (new)
  - `.nuclear/changes/ao-daemon-worktrees/risk.md` (new)
  - `.nuclear/changes/ao-daemon-worktrees/proof.md` (new)
- Controlled items touched: Go daemon internal packages (`daemon/internal/gitworktree`, `daemon/internal/runner`).
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no (containment error messages on `LockHome` now include `pid` diagnostics when a holder PID is recorded, preserving the existing `"already running"` substring).
- Dependency/model/API/prompt/tool permission changed? yes/no: no.
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A worktree helper, lock wait loop, or probe health classifier behaves unexpectedly under contention or permission edge cases. Existing `LockHome` callers keep their exact contract and fail-closed posture. |
| Reversibility | Instant: revert the commit on `feat/ao-s2-daemon-worktrees`. |
| Detectability | High: deterministic `-race` unit tests cover worktree create/destroy, `.discarded/` sweep, concurrent teardown, `0500` permission repair, symlink non-traversal, orphan move-aside vs. `ErrPathOccupied`, stale `initializing` vs. operator locks, `DefaultBranchResolver`, `ClassifyGitFailure`, `LockHomeWithWait`, `BootBarrier`, and `MassFailureBreaker`. |
| Exposure | Go daemon internals (`daemon/internal/gitworktree` and `daemon/internal/runner`). |
| Uncertainty | Low: uses Go 1.24 standard library (`os.OpenRoot`, `syscall.Flock`, `os/exec`) with local temporary git repository fixtures. |
| Why Quick is enough | No CODEOWNERS trust surface (`spec/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`), external dependency, or public assurance claim is modified. |

## Required proof

- Command/check/eval to run: six checks.
  - `cd daemon && go test -race ./internal/gitworktree/...`
  - `cd daemon && go test -race ./internal/gitworktree/... ./internal/runner -run "TestLock|TestProbeHealth|TestMassFailure"`
  - `python3 tools/check_originality.py` (with all files staged)
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `python3 /home/flyfission/projects/Nuclear-grade/tools/ng.py validate .nuclear/changes/ao-daemon-worktrees/`
- Expected result: one per check.
  - All `internal/gitworktree` race tests pass (exit 0);
  - All targeted `internal/runner` lock, probe health, and mass-failure breaker race tests pass (exit 0);
  - `originality check passed` (exit 0);
  - `public claims check passed` (exit 0);
  - `git diff --cached --check` produces empty output (exit 0);
  - `OK: .nuclear/changes/ao-daemon-worktrees` (exit 0).
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the 14 paths listed in Scope.
- Expected result: `git status` shows only those paths and zero modifications under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`.
- Stop condition: any edit outside Scope, any data race or test failure under `go test -race`, or any originality / public-claims / `ng.py validate` failure.

## Escalation check

Move up to Standard if this change modifies `/spec/`, `/kernel/`, `/policies/`, `/tests/redteam/`, `.github/workflows/`, or `docs/adr/`, or alters cgroup/seccomp confinement rules. None of these is in this change.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- All `go test -race` suites, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and `ng.py validate` pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [gitworktree manager](../../../daemon/internal/gitworktree/manager.go), [home lock](../../../daemon/internal/runner/lock_unix.go), [probe health breaker](../../../daemon/internal/runner/probe_health.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
