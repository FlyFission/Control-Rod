# Quick Risk: Neutral-root reviewer manifests, content-addressed JCS receipts, and prompt-injection hygiene

## Selected mode

- **Mode:** Quick
- **Why this mode:** Self-contained Go daemon package addition (`daemon/internal/reviewgateway/*`) and unit tests with no edits to CODEOWNERS-protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`), no new external dependencies, and no changes to public assurance claims.

---

## Change

- Slug: ao-review-gateway
- PR / issue: Slice 6 on branch `feat/ao-s6-review-gateway` (`#124`, `#128`, `#132`)
- Owner: Ben Huffer (decision owner); implemented by subagent for Slice 6
- Date: 2026-11-22
- Summary: add `daemon/internal/reviewgateway` implementing `AO-12` neutral-root reviewer manifest preparation and prompt-injection hygiene.
  - Add `daemon/internal/reviewgateway/gateway.go` with `Task`, `Manifest` (binding Control Rod custody metadata: `ReviewerID`, `WorkerSessionID`, `PackageID`, `Revision`, `ReleaseManifestDigest`, `DataLane`, `WorkspacePath`, `TaskPromptRoot`, `Tasks`, `RequireConfinement`), `Environment`, `ValidateManifest`, and `PrepareEnvironment(dataDir, m)`.
  - Enforce private neutral-root creation at `<dataDir>/reviewer-runtime/<reviewerID>` (`0o700`) with isolated `workspace`, `config`, `state`, `cache`, `tmp`, `manifests`, and empty `disabled-git-hooks` subdirectories, guaranteeing the repository checkout is never the reviewer working directory (`ErrWorkspaceCollision`), confining `TaskPromptFile` inside `TaskPromptRoot` via `os.OpenRoot` (`ErrPromptEscape`), refusing unsandboxed/host-trusted fallback (`RequireConfinement: true`, `ErrConfinementRequired`), and writing canonical RFC 8785 JSON manifests atomically at `<manifestsDir>/<sha256>.json` using `O_CREATE|O_EXCL` at mode `0o600` with byte-for-byte verification on idempotent re-writes (`ErrManifestTampered`).
  - Add `daemon/internal/reviewgateway/prompt_hygiene.go` with `UntrustedEvidenceBrief(baseSHA, headSHA, packageID, revision)` instructing the independent reviewer to inspect only committed git ranges (`git diff <baseSHA>...<headSHA>` and `git show <headSHA>`), never inspect the live working tree, treat repository files/diffs/comments/tool output strictly as untrusted data, never execute repository hooks/scripts, distinguish static reasoning from executed checks, and separate required `[P0]`/`[P1]`/`[P2]` defect findings (trigger, path, consequence) from optional non-blocking nits.

## Scope

- Affected files/configs/docs: 5 paths.
  - `daemon/internal/reviewgateway/gateway.go` (new)
  - `daemon/internal/reviewgateway/prompt_hygiene.go` (new)
  - `daemon/internal/reviewgateway/gateway_test.go` (new)
  - `.nuclear/changes/ao-review-gateway/risk.md` (new)
  - `.nuclear/changes/ao-review-gateway/proof.md` (new)
- Controlled items touched: Go daemon internal package (`daemon/internal/reviewgateway`).
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no.
- Dependency/model/API/prompt/tool permission changed? yes/no: no (adds an internal prompt-hygiene brief builder for reviewer sessions without changing existing runtime grants).
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A reviewer manifest validation check or neutral-root preparation helper rejects a valid manifest or fails to prepare its directory layout. Existing daemon packages are unaffected. |
| Reversibility | Instant: revert the commit on `feat/ao-s6-review-gateway`. |
| Detectability | High: deterministic `-race` unit tests cover `0o700` neutral-root creation, `disabled-git-hooks`, checkout-never-cwd collision rejection, `O_CREATE\|O_EXCL` `0o600` content-addressed manifest writing, idempotent re-write verification, tamper detection, PR URL / SHA / custody validation, `os.OpenRoot` prompt confinement against `..` and symlink escapes, and `UntrustedEvidenceBrief` output invariants. |
| Exposure | Go daemon internals (`daemon/internal/reviewgateway`). |
| Uncertainty | Low: uses Go 1.24 standard library (`os.OpenRoot`, `crypto/sha256`, `net/url`) and existing `github.com/gowebpki/jcs` dependency. |
| Why Quick is enough | No CODEOWNERS trust surface (`spec/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`), external dependency, or public assurance claim is modified. |

## Required proof

- Command/check/eval to run: five checks.
  - `cd daemon && go test -v -race ./internal/reviewgateway/...`
  - `python3 tools/check_originality.py` (with all files staged)
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `python3 /home/flyfission/projects/Nuclear-grade/tools/ng.py validate .nuclear/changes/ao-review-gateway/`
- Expected result: one per check.
  - All `internal/reviewgateway` race tests pass (exit 0);
  - `originality check passed` (exit 0);
  - `public claims check passed` (exit 0);
  - `git diff --cached --check` produces empty output (exit 0);
  - `OK: .nuclear/changes/ao-review-gateway` (exit 0).
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the 5 paths listed in Scope.
- Expected result: `git status` shows only those 5 paths and zero modifications under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`.
- Stop condition: any edit outside Scope, any data race or test failure under `go test -race`, or any originality / public-claims / `ng.py validate` failure.

## Escalation check

Move up to Standard if this change modifies `/spec/`, `/kernel/`, `/policies/`, `/tests/redteam/`, `.github/workflows/`, or `docs/adr/`, or alters cgroup/seccomp confinement rules. None of these is in this change.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- All `go test -race` suites, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and `ng.py validate` pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [reviewgateway gateway](../../../daemon/internal/reviewgateway/gateway.go), [prompt hygiene](../../../daemon/internal/reviewgateway/prompt_hygiene.go), [reviewgateway tests](../../../daemon/internal/reviewgateway/gateway_test.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
