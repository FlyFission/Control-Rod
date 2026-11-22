# Quick Risk: Hidden-ref filesnapshot, os.OpenRoot artifactstore, scmobserver, and rational pricing

## Selected mode

- **Mode:** Quick
- **Why this mode:** Adds four self-contained Go internal packages (`daemon/internal/artifactstore`, `daemon/internal/filesnapshot`, `daemon/internal/pricing`, `daemon/internal/scmobserver`) and unit tests with zero edits to CODEOWNERS-protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`).

---

## Change

- Slug: ao-snapshots-scm
- PR / issue: Slice 3 on branch `feat/ao-s3-snapshots-scm` (`#124`, `#126`, `#128`, `#131`, `#132`)
- Owner: Ben Huffer (decision owner); implemented by subagent for Slice 3
- Date: 2026-11-22
- Summary: four Go daemon packages implementing `AO-9`, `AO-10`, `AO-11`, and `AO-13`.
  - `daemon/internal/filesnapshot`: hidden-ref Git worktree snapshots (`refs/controlrod/snapshots/...`) using a disposable `GIT_INDEX_FILE`, hardened git execution, nested-repository refusal, untracked caps, `PlanID` tamper detection, and `BeforeRollbackRef` rollback safety.
  - `daemon/internal/artifactstore`: Go 1.24 `os.OpenRoot`-confined content-addressed blob store with stream hashing, size caps, and two-poll `StabilityTracker`.
  - `daemon/internal/scmobserver`: ProviderID-primary PR identity, positional batch attribution, monotonic cursor guard, two-phase semantic-hash acknowledgement, terminal PR eviction, current-`HeadSHA` check reduction (`CANCELLED` as failing), `ReviewPlanner`, and controller-only GitHub Check Run builder.
  - `daemon/internal/pricing`: exact-rational (`*big.Rat`, zero floats) SHA-256 hash-pinned pricing catalog loader and deterministic override version stamping.

## Scope

- Affected files/configs/docs: 17 paths.
  - `daemon/internal/artifactstore/rename_linux.go` (new)
  - `daemon/internal/artifactstore/rename_other.go` (new)
  - `daemon/internal/artifactstore/stability.go` (new)
  - `daemon/internal/artifactstore/store.go` (new)
  - `daemon/internal/artifactstore/store_test.go` (new)
  - `daemon/internal/filesnapshot/snapshot.go` (new)
  - `daemon/internal/filesnapshot/snapshot_test.go` (new)
  - `daemon/internal/pricing/pricing.go` (new)
  - `daemon/internal/pricing/pricing_test.go` (new)
  - `daemon/internal/scmobserver/batch.go` (new)
  - `daemon/internal/scmobserver/checkrun.go` (new)
  - `daemon/internal/scmobserver/identity.go` (new)
  - `daemon/internal/scmobserver/observer_test.go` (new)
  - `daemon/internal/scmobserver/planner.go` (new)
  - `daemon/internal/scmobserver/reducer.go` (new)
  - `.nuclear/changes/ao-snapshots-scm/risk.md` (new)
  - `.nuclear/changes/ao-snapshots-scm/proof.md` (new)
- Controlled items touched: Go daemon internal packages (`daemon/internal/{artifactstore,filesnapshot,pricing,scmobserver}`).
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? no
- Dependency/model/API/prompt/tool permission changed? no
- Release or rollback posture changed? no

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A snapshot, artifact capture, SCM reducer, or rational pricing helper behaves unexpectedly when wired in a future slice. Existing daemon runtime paths are untouched. |
| Reversibility | Instant: revert the commit on `feat/ao-s3-snapshots-scm`. |
| Detectability | High: 23 deterministic `-race` unit tests across all four packages, including an AST test verifying zero floating-point types in `pricing`. |
| Exposure | Go daemon internal packages (`daemon/internal/`). |
| Uncertainty | Low: standard library Go 1.24 (`os.OpenRoot`, `math/big`, `crypto/sha256`, `os/exec`) verified against real temporary git repositories. |
| Why Quick is enough | No CODEOWNERS trust surface, external dependency, or public assurance claim is changed. |

## Required proof

- Command/check/eval to run: five checks.
  - `cd daemon && go test -race -v ./internal/artifactstore/... ./internal/filesnapshot/... ./internal/pricing/... ./internal/scmobserver/...`
  - `python3 tools/check_originality.py`
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `python3 /home/flyfission/projects/Nuclear-grade/tools/ng.py validate .nuclear/changes/ao-snapshots-scm/`
- Expected result: all 23 tests pass under `-race`, originality and public-claims checks pass, git diff check is clean, and `ng.py validate` prints `OK`.
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the 17 paths listed in Scope.
- Expected result: zero modifications under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`.
- Stop condition: any test failure under `go test -race`, any float type in `pricing`, or any originality / public-claims / validation failure.

## Escalation check

Move up to Standard if this change modifies `/spec/`, `/kernel/`, `/policies/`, `/tests/redteam/`, `.github/workflows/`, or `docs/adr/`. None of these is touched.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- All `go test -race` suites, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and `ng.py validate` pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [filesnapshot](../../../daemon/internal/filesnapshot/snapshot.go), [artifactstore](../../../daemon/internal/artifactstore/store.go), [scmobserver](../../../daemon/internal/scmobserver/planner.go), [pricing](../../../daemon/internal/pricing/pricing.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
