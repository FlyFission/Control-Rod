# Plan: Phase 2 daemon recovery hardening (#118/#119 remainder, #120)

1. Create this change record under `.nuclear/changes/r2-daemon-recovery-hardening/` before editing anything.
2. Audit the #135 remainder against #118: trace the New Work selections (runtime, model, reasoning, repo, branch, workspace) through capture, claim and launch. Gap found → file it as a narrow issue with the exact UI field and code path, not a reopen; close #118 as split with landed evidence.
3. Audit the #135 remainder against #119: a test where two daemon claims race for one queued run (exactly one wins, winner's evidence path intact) and a test that a second run bound to the same checkout is refused, never staged, and that custody is per-run and re-claimable.
4. Trace #120's six behaviors in `daemon/internal/runner/daemon.go` (lease acquisition, heartbeat, cancellation/SCRAM, process-tree termination, completion retry, outbox replay) and write the recovery matrix as a section of `docs/daemon.md`, one page, rows fault / expected / observed / test.
5. Write the deterministic fault-injection tests the matrix demands and that do not yet exist (control-plane restart over the same database), and run `cd daemon && go test ./...` and `cd services/api && pnpm test`.
6. Close #120 with the matrix and tests as evidence; comment the audit outcomes on #119 keeping its remaining scope; update `docs/status.md` only with PR-citable facts; validate this record with the pinned validator and ship on green CI.

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
