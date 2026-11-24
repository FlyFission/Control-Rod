# Basis: Phase 2 daemon recovery hardening (#118/#119 remainder, #120)

**Change slug:** `r2-daemon-recovery-hardening`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** whether Phase 2 of the ten-x amendment program (`docs/superpowers/plans/2026-11-24-ten-x-amendment.md`) is executed as planned: audit the #135 remainder against #118 and #119, trace #120's six behaviors, write the recovery matrix with deterministic fault-injection tests, and close or split the issues on that evidence.

## Mission / need

The program plan's Phase 2 (P0 trust gaps #118–#120): the merged #135 landed typed checkout custody but left #118's runtime-binding remainder unaudited, #119's concurrency qualification was a plan check rather than a test, and #120 demands a fault-injection recovery matrix the repo did not have in one place.

## Scope

In scope:
- `services/api/test/runs.test.ts`: two new tests (concurrent claims race; control-plane restart over the same database) and the pre-check drains they need.
- `services/api/test/harness.ts`: `restartedApp`, a test-only helper that builds a second app instance over the same database and root.
- `daemon/internal/runner/checkout_hardening_test.go`: `TestASecondAuthorRunOnTheSameCheckoutIsRefusedNotShared`.
- `docs/daemon.md`: the "Recovery matrix" section.
- `docs/status.md`: the New Work binding bullet, updated to what is landed (#135) and what is open (#175).
- Issue dispositions: #118 closed as split with the evidence comment; #175 filed for the reasoning-selector gap; #119 keeps its remaining scope with the audit outcomes commented; #120 closed on the matrix and tests.
- This change record under `.nuclear/changes/r2-daemon-recovery-hardening/`.

Out of scope:
- Production code of any kind: no `services/api/src`, `daemon/internal/runner` non-test file, `spec/`, `kernel/`, migration or policy change is in this record.
- `policies/`, `tests/redteam/`, `.github/`, `docs/adr/` (untouched).
- #119's full acceptance (a repeatable concurrent stress suite across many jobs, merge-conflict handling with an explicit review gate, documented OS limits): Phase 2 audits the two named checks (concurrent claims, per-run worktree paths); the rest stays open on the issue.
- #175's implementation (reasoning binding into runs).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Execute Phase 2 of the ten-x amendment program, inline | "Execute Phase 2 (P0 daemon hardening: #118/#119 remainder from the merged #135, then #120's lease/heartbeat/cancellation/outbox recovery matrix with deterministic fault-injection tests) — inline, native mode, per the plan's steps." | 2026-11-24, chat session resuming the program | Run the plan's Phase 2 steps 1–5 exactly: audit #135's remainder against #118 and #119, trace #120's six behaviors, write the matrix and the deterministic tests, then close or split the issues with the evidence. | Phases 3–7 (each stops at its phase boundary for the owner's confirmation); #175's implementation. |
| D2 | Non-trust changes proceed on green CI without re-asking | "Trust surfaces (all of .github/, docs/adr/, policies/, tests/redteam/, spec/ major versions, kernel decision functions) need my recorded yes naming the surface, recorded in the record's Signature table (ADR 0025 sole-maintainer rule). Non-trust changes on green CI proceed without re-asking." | 2026-11-24, chat session (standing governance, restated from Phase 1) | This change touches no trust surface, so it ships on green CI with no Signature-table entry; the Phase 1 merge mechanics (mark ready, squash with `--admin` and `--match-head-commit` at the verified full head SHA) carry over for its merge. | Any trust surface this phase might have wanted to touch (none identified). |

## Fixed inputs

1. `AGENTS.md` rules 1–6; ADR 0025 sole-maintainer sign-off; `docs/collaboration.md`.
2. The ten-x amendment plan, Phase 2 (`docs/superpowers/plans/2026-11-24-ten-x-amendment.md`, branch `audit/10x-20261124`), and the review it argues from (`TEN-X-REVIEW-20261124.md`).
3. `origin/main` @ `51a9e7ea` (CI green, all seven jobs), which includes the Phase 1 merge train and the owner's author-thread merges #173 and #171; #171 touches `daemon/internal/runner/`, so this branch bases on it, not on the Phase 1 exit commit `4040b9fc`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The claim's single-winner guarantee comes from the budget advisory lock plus `for update skip locked` inside one transaction. | `services/api/src/work.ts` `claim` (the run row lock and the budget lock). | A claim path change that reads a queued run without the row lock; the race test would then be inadequate and must be rewritten against the new mechanism. |
| Control-plane custody state (claim token, lease, idempotency receipts, queued runs) is Postgres rows, so a restart is a new app instance over the same database. | `services/api/src/work.ts` `complete` (completion key on the run row); the harness's `restartedApp`. | State moving into process memory (a cache that a restart loses); the restart test would need to become a process-level restart. |
| A bound checkout's custody lock excludes a second run within one daemon home, and custody ends with the run. | `daemon/internal/runner/workspace.go` `Prepare`, `checkoutLockPath`, `lockCheckout`. | Custody moving to a cross-host mechanism; the exclusion test would understate the guarantee it must pin. |

## Open questions for Ben (not decided here)

1. Whether #119's remaining scope (the multi-job stress suite and the merge-conflict review gate) should be scheduled now or folded into later product work; the issue stays open either way.
2. #175's priority relative to Phase 3 (distribution): it is filed P0 as the remainder of #118, but nothing in Phase 2 depends on it.

## Verification limits (what the tests enforce)

- The concurrent-claims test proves exactly one winner and the winner's intact evidence path; it does not prove fairness or ordering between the two daemons, which the queue does not promise.
- The restart test proves a fresh app instance over the same Postgres honours an existing claim token, renews its lease, and replays a completion receipt by idempotency key. It does not kill and re-exec the API process; nothing in the custody path is process state, and that is the claim the test makes.
- The custody exclusion test proves refusal, no staging, per-run directories, and re-claimability after release within one daemon home. Custody locks are per-home by design; exclusion across homes is out of scope (r1-1 record).

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
