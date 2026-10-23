# Preparation file broker implementation plan

**Goal:** Implement the two bounded file capabilities required by a broker-only preparation adapter.
**Spec:** `docs/superpowers/specs/2026-10-23-preparation-file-broker-design.md`.
**Architecture:** Internal Go module; live authority callback encloses each capability operation and its audit event. Retained os.Root handles constrain filesystem access. No native runtime integration or active profile in this slice.
**Stack:** Repository Go 1.24.7, standard library only, Linux.

## Constraints

Preserve current runtime behavior, inactive preparation roles and all protected surfaces. No new dependency. Tests use actual temporary files and synthetic grants, not real credentials. Budgets are resource limits, not engineering quantities. Persist RED/GREEN and limits in the parent execution ledger.

## Task 1 — assigned reads and grant admission

- [x] Create `daemon/internal/confinement/broker_test.go` with fake transactional authority and exact filesystem cases. Run focused tests before implementation; observe failure.
- [x] Implement `broker.go` (scope/grant/event/authority, root lifecycle, admission, bounded rehashed reads) and `files_linux.go`/`files_other.go` (nonblocking regular-file open; unsupported OS refusal).
- [x] Verify scope/capability drift, expiry, revocation, cancellation, size, source SHA, path/symlink/special-file and root-overlap failures, with no returned bytes.

## Task 2 — fixed proposal output and audit custody

- [x] Add failed-first tests for exact output bytes, exclusive creation, size/permissions, event/authority failure cleanup, late expiry, concurrency and roots renamed after open.
- [x] Implement `WriteProposal`; return only after successful custody recording. Report cleanup errors.
- [x] Run focused race tests and vet. Review output visibility/authority integration limits against the spec.

## Task 3 — whole slice verification and publication

- [x] Run daemon race suite, vet and formatting; unsupported-target compile check; strict change-record validation. Update mission/verification/ledger with observed results.
- [x] Get the required final fresh-context review under the existing execution workflow; fix Important defects with failed-first regressions in one pass.
- [ ] Commit with DCO and push to PR #6 under the user's existing push-and-continue authority; verify exact remote SHA and CI. Refresh Windows evidence packet.

No per-task reviewer or generic approval round. The final review is the single fresh context for this implemented slice. Stop integration if the real grant authority or native confinement is missing; do not replace it with a permissive implementation.
