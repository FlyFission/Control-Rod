# Ship: Phase 2 daemon recovery hardening (#118/#119 remainder, #120)

Release decision: **authorized on green CI without a sign-off table entry** — no trust surface is touched (`policies/`, `tests/redteam/`, all of `.github/`, `docs/adr/`, `spec/`, kernel decision functions are unchanged), per the owner's standing governance: "Non-trust changes on green CI proceed without re-asking."

- **Shipped:** the #135-remainder audits (recorded on #118 and #119), the reasoning-binding gap filed as #175, the recovery matrix in `docs/daemon.md`, and three deterministic fault-injection tests (concurrent-claim race, checkout custody exclusion, control-plane restart) plus the test-only `restartedApp` harness helper.
- **Not claimed:** that any live Claude Code or Codex process was fault-injected (the daemon tests use the fake runtime with real git worktrees and real custody locks; the API tests use a real Postgres with the daemon mocked); that the API process was killed and re-executed (the restart test builds a second app instance over the same database — custody is rows, and that is the claim the test makes); that #119's full acceptance (multi-job stress suite, merge-conflict review gate, documented OS limits) is met — the plan's two named checks are done and the rest stays open on the issue; that the reasoning selector binds into runs (#175 is open).
- **Matrix honesty:** every row names the test that pins it. The macOS post-restart limitation (a run left behind can be stopped only on Linux, through a pidfd; on macOS its outcome stays unknown for a person) is stated in the row, as `docs/daemon.md` already stated it above the matrix.
- **Known wrinkle observed during development:** the first draft of the claim-race test polluted the shared API suite (its package's pre-check stayed queued and six later tests claimed it); fixed by draining the pre-check in the file's existing style, and the full suite re-run green.
- **Review fix before merge:** the PR's Codex-connector review caught that the restart test replayed a receipt through the same instance that recorded it; the replay and the different-key refusal now go through a second app instance built after the completion, so the assertion pins receipt survival across a restart. Suite re-run green.

Rollback: revert the squash commit. No production code, contract, migration or policy change is included.

Monitoring after merge: the matrix's Test column is the contract — if a change to the claim path, custody locks, outbox or SCRAM breaks any test named there, the matrix row and the change that broke it must be updated together.

## Required links
[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The #135 remainder is audited against #118 and #119 with the outcomes recorded, and any gap is filed as a narrow issue, not a reopen.
2. #120's six behaviors are traced in `daemon/internal/runner/daemon.go` and written up as a one-page recovery matrix under `docs/`, one row per fault with expected behavior, observed behavior and the deterministic test that pins it.
3. The deterministic fault-injection tests the matrix demands exist and pass: concurrent claims, checkout custody exclusion, control-plane restart, and the previously covered network-loss, SIGKILL-orphan-sweep, timeout, lost/late-completion and duplicate-completion rows.
4. `cd services/api && pnpm test` and `cd daemon && go test ./...` are green.
5. #120 is closed with the matrix and tests as evidence, or split; `docs/status.md` changes only PR-citable facts.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
