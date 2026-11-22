# Quick Risk: Operational battle-scar hardening guards and regression suite

## Selected mode

- **Mode:** Quick
- **Why this mode:** Self-contained Go daemon package addition (`daemon/internal/battlescars/*` and unit/concurrency tests) with no edits to CODEOWNERS-protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`), no external dependencies, and zero changes to existing runtime wiring.

---

## Change

- Slug: ao-battlescars-suite
- PR / issue: Slice 7 on branch `feat/ao-s7-battlescars-suite` (`#118`, `#119`, `#120`, `#127`, `#131`, `#132`)
- Owner: Ben Huffer (decision owner); implemented by subagent for Slice 7
- Date: 2026-11-22
- Summary: six operational hardening guards and a deterministic regression suite in `daemon/internal/battlescars`.
  - Add `daemon/internal/battlescars/sanitize.go` (`SanitizeExternalText`) to strip internal standing-instruction and wrapper tags (`<ao-standing-instructions>`, `<ao-worker-reports>`, `<system-reminder>`, `<pasted_content>`, including nested or unclosed openers and stray closers), strip ANSI escapes and ASCII/Unicode control characters while collapsing line breaks into single-line external status/notification/receipt text, and truncate cleanly on a valid UTF-8 rune boundary within `maxBytes`.
  - Add `daemon/internal/battlescars/stop.go` (`IdempotentStopTracker`) providing mutex-synchronized turn-scoped `(sessionID, turnID)` stop coordination so only the first `RequestStop` signals (`shouldSignal=true, alreadyStopped=false`) while duplicate requests or requests against waking/archiving sessions return `(shouldSignal=false, alreadyStopped=true)`.
  - Add `daemon/internal/battlescars/delivery.go` (`BoundedDeliveryBudget`) tracking per-item message/report delivery attempts with `MaxAttempts` and `MaxAge` thresholds, returning `DeliveryRetry`, `DeliveryDeadLetter` (quarantining stuck items instead of retrying forever), or `DeliveryAcked`.
  - Add `daemon/internal/battlescars/filename.go` (`SafeCollisionFilename`) appending collision suffixes (`-1`, `-2`, ...) before the file extension while bounding the UTF-8 byte length within `maxBytes` (default 255 bytes, POSIX `NAME_MAX`), truncating the base stem on a valid UTF-8 rune boundary and rejecting path separators or control characters.
  - Add `daemon/internal/battlescars/auth_preserve.go` (`ResolveAuthStateOnError` and `IsTransientAuthProbeError`) classifying transient storage/keychain/IO errors (`os.ErrDeadlineExceeded`, `syscall.EIO`, `syscall.EACCES`, `syscall.EBUSY`, context deadline/canceled) so transient credential-read failures preserve `prevKnownGood` instead of signing the user out, while explicit auth rejection (`probeErr == nil && !probeAuth`) clears auth.
  - Add `daemon/internal/battlescars/timestamp.go` (`NormalizeUTCTimestamp`) parsing RFC3339/RFC3339Nano timestamps, rejecting naive timezone-less strings, and formatting to canonical UTC (`2006-01-02T15:04:05.000Z`) so lexical order matches chronological order, plus unit and concurrency tests in `daemon/internal/battlescars/battlescars_test.go`.

## Scope

- Affected files/configs/docs: 9 paths.
  - `daemon/internal/battlescars/sanitize.go` (new)
  - `daemon/internal/battlescars/stop.go` (new)
  - `daemon/internal/battlescars/delivery.go` (new)
  - `daemon/internal/battlescars/filename.go` (new)
  - `daemon/internal/battlescars/auth_preserve.go` (new)
  - `daemon/internal/battlescars/timestamp.go` (new)
  - `daemon/internal/battlescars/battlescars_test.go` (new)
  - `.nuclear/changes/ao-battlescars-suite/risk.md` (new)
  - `.nuclear/changes/ao-battlescars-suite/proof.md` (new)
- Controlled items touched: Go daemon internal package (`daemon/internal/battlescars`).
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no (new internal operational guard package ready for daemon caller integration).
- Dependency/model/API/prompt/tool permission changed? yes/no: no.
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A text sanitizer, stop tracker, delivery budget, filename truncator, auth probe classifier, or timestamp normalizer mishandles an edge case in unit tests. No existing runtime code paths are altered. |
| Reversibility | Instant: revert the commit on `feat/ao-s7-battlescars-suite`. |
| Detectability | High: deterministic `-race` unit tests cover multi-byte UTF-8 truncation at 255 bytes, nested/malformed wrapper tag stripping, 64-goroutine concurrent `IdempotentStopTracker` contention, dead-letter quarantine after `MaxAttempts` and `MaxAge`, transient `syscall.EIO` auth preservation vs. explicit sign-out, and naive timestamp rejection. |
| Exposure | Go daemon internals (`daemon/internal/battlescars`). |
| Uncertainty | Low: uses only Go 1.24 standard library packages (`regexp`, `strings`, `sync`, `syscall`, `time`, `unicode`, `unicode/utf8`). |
| Why Quick is enough | No CODEOWNERS trust surface (`spec/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`), external dependency, or public assurance claim is modified. |

## Required proof

- Command/check/eval to run: five checks.
  - `cd daemon && go test -v -race ./internal/battlescars/...`
  - `python3 tools/check_originality.py` (with all files staged)
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `python3 /home/flyfission/projects/Nuclear-grade/tools/ng.py validate .nuclear/changes/ao-battlescars-suite/`
- Expected result: one per check.
  - All `internal/battlescars` race and unit tests pass (exit 0);
  - `originality check passed` (exit 0);
  - `public claims check passed` (exit 0);
  - `git diff --cached --check` produces empty output (exit 0);
  - `OK: .nuclear/changes/ao-battlescars-suite` (exit 0).
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the 9 paths listed in Scope.
- Expected result: `git status` shows only those paths and zero modifications under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`.
- Stop condition: any edit outside Scope, any data race or test failure under `go test -race`, or any originality / public-claims / `ng.py validate` failure.

## Escalation check

Move up to Standard if this change modifies `/spec/`, `/kernel/`, `/policies/`, `/tests/redteam/`, `.github/workflows/`, or `docs/adr/`, or alters cgroup/seccomp confinement rules. None of these is in this change.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- All `go test -race` suites, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and `ng.py validate` pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [external text sanitizer](../../../daemon/internal/battlescars/sanitize.go), [idempotent stop tracker](../../../daemon/internal/battlescars/stop.go), [bounded delivery budget](../../../daemon/internal/battlescars/delivery.go), [safe collision filename](../../../daemon/internal/battlescars/filename.go), [auth state preservation](../../../daemon/internal/battlescars/auth_preserve.go), [UTC timestamp normalizer](../../../daemon/internal/battlescars/timestamp.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
