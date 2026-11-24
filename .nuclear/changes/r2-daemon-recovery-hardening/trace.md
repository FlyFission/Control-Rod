# Trace: Phase 2 daemon recovery hardening (#118/#119 remainder, #120)

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R2-1 | #118 audit: what of the New Work selections binds into the daemon run after #135, and what does not. | E-04 (issue #118 close comment with file:line pointers; issue #175) | done — checkout/branch/runtime/model bind typed; reasoning is parsed (`services/api/src/work.ts` `parseCaptureRuntimeTags`) and validated in project prefs (`services/api/src/workspace-projects.ts`) but never persisted or carried in the claim (`daemon/internal/runner/types.go` `Run.Runtime` has provider and model only); filed as #175, #118 closed as split |
| R2-2 | #119 audit (plan's named checks): two daemon claims against the same queued run leave exactly one winner with an intact evidence path; a second run bound to the same checkout is refused, never staged, and custody is per-run and re-claimable. | E-01 (runs.test.ts "gives a queued run to exactly one of two claims that race for it"), E-02 (checkout_hardening_test.go `TestASecondAuthorRunOnTheSameCheckoutIsRefusedNotShared`) | done for the plan's checks; #119's full stress-qualification scope stays open on the issue with the audit outcomes commented |
| R2-3 | #120's six behaviors traced in `daemon/internal/runner/daemon.go` and written as a one-page recovery matrix (rows: fault; columns: expected, observed, test) under `docs/`. | E-03 (`docs/daemon.md` "Recovery matrix") | done |
| R2-4 | Deterministic fault-injection tests exist for every matrix row: claim race, checkout exclusion, control-plane restart (new), and the previously covered network loss, hanging heartbeat, SIGKILL-orphan sweep, timeout, lost/late completion, duplicate completion, outbox lifecycle, stop, run-gone, uncontained. | E-01, E-02, E-03 (matrix's Test column) | done — one new row (control-plane restart) needed a new test; every other row named a test that already existed and was verified green in this change's full-suite runs |
| R2-5 | Invariants: no duplicate approvals/completions; no untracked surviving agent process after SCRAM/stop; every lost or recovered run visibly identified. | E-01 (same-key replay, different-key `already-complete`), E-03 (matrix rows for stop/SCRAM, orphan sweep, lost/late completion) | done as far as the fake-runtime and real-Postgres harnesses reach; live-agent fault injection is not claimed (ship limits) |
| R2-6 | `docs/status.md` updated only with PR-citable facts. | E-03 (`docs/status.md` New Work bullet: #135 landed bindings, #175 open remainder) | done |
| R2-7 | Issue dispositions recorded on the issues themselves. | E-04 (#118 closed with evidence; #175 created; #119 and #120 to be actioned at merge per ship.md) | done at merge time by the same session |

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
