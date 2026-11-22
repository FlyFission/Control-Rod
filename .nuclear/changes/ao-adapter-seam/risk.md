# Quick Risk: AO Slice 4 — Declarative BinarySpec, Secret-Free AuthProbe, and Runner Adapter Seam

## Selected mode

- **Mode:** Quick
- **Why this mode:** Local internal daemon refactoring and additive unit tests inside `daemon/internal/binaryutil`, `daemon/internal/authprobe`, and `daemon/internal/runner` (`AO-9`–`AO-11`, `#126`–`#128`). Preserves all existing sandbox policies, `AgentEnv` allowlisting, `resolveArtifact` pinning, and protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`).

---

## Change

- Slug: ao-adapter-seam
- PR / issue: Slice 4 on branch `feat/ao-s4-adapter-seam` (`#126`–`#128`, `AO-9`–`AO-11`)
- Owner: Ben Huffer (decision owner); implemented by subagent under Slice 4 task instructions
- Date: 2026-11-22
- Summary: three daemon packages added or extended.
  - Add `daemon/internal/binaryutil` providing declarative `BinarySpec`, deterministic candidate search across filtered `PATH` and well-known locations (skipping `/mnt/[a-z]/`), surgical Node directory `PATH` augmentation for `#!/usr/bin/env node` wrapper scripts without login-shell env inheritance, `VerifyInterpreterAndTarget` script target verification, and secret-value error redaction (`RedactValues`, `RedactError`).
  - Add `daemon/internal/authprobe` providing secret-free `AuthProbe` (`Configured`, `Authorized`, `Unauthorized`, `Unknown`) and structured `AuthDiagnostic` that discards CLI stdout/stderr to `io.Discard` and runs with a filtered environment (`STDIN=/dev/null`, `NO_COLOR=1`, `TERM=dumb`, `CI=1`).
  - Wire `BinarySpecifier`, `ResolveAdapterBinary`, `AuthProber`, `ProbeAdapterAuth`, and surgical `ExecRunner` Node `PATH` augmentation across `daemon/internal/runner` (`adapter*.go`, `daemon.go`, `probe.go`, `subscriptions.go`) with isolated-home, non-interactive probe, and zero-secret-leakage tests (`adapter_seam_test.go`).

## Scope

- Affected files/configs/docs: 13 daemon files plus this change record (`risk.md` and `proof.md`).
  - `daemon/internal/binaryutil/binaryutil.go` (new)
  - `daemon/internal/binaryutil/binaryutil_test.go` (new)
  - `daemon/internal/authprobe/authprobe.go` (new)
  - `daemon/internal/authprobe/authprobe_test.go` (new)
  - `daemon/internal/runner/adapter.go`
  - `daemon/internal/runner/adapter_agy.go`
  - `daemon/internal/runner/adapter_claude.go`
  - `daemon/internal/runner/adapter_codex.go`
  - `daemon/internal/runner/adapter_grok.go`
  - `daemon/internal/runner/adapter_ollama.go`
  - `daemon/internal/runner/adapter_opencode.go`
  - `daemon/internal/runner/daemon.go`
  - `daemon/internal/runner/probe.go`
  - `daemon/internal/runner/subscriptions.go`
  - `daemon/internal/runner/adapter_seam_test.go` (new)
  - `.nuclear/changes/ao-adapter-seam/risk.md` (new)
  - `.nuclear/changes/ao-adapter-seam/proof.md` (new)
- Controlled items touched: `daemon/internal/runner`, `daemon/internal/binaryutil`, `daemon/internal/authprobe`.
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no external API or CLI contract change; improves binary discovery for `#!/usr/bin/env node` wrappers when Node lives in NVM/fnm/Volta/asdf/Homebrew and keeps auth probe diagnostics secret-free.
- Dependency/model/API/prompt/tool permission changed? yes/no: no.
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A runtime binary lookup or auth probe could misclassify a local CLI status or fail to locate Node for a wrapper script. Sandbox policy enforcement, `AgentEnv` secret stripping, and artifact digest pinning remain enforced. |
| Reversibility | Instant: revert the commit on `feat/ao-s4-adapter-seam`. |
| Detectability | High: covered by `-race` unit tests in `daemon/internal/authprobe`, `daemon/internal/binaryutil`, and `daemon/internal/runner`. |
| Exposure | Local daemon runtime detection and preflight probing only. |
| Uncertainty | Low: deterministic filesystem and synthetic CLI script tests cover all probe statuses, secret redaction, `/mnt/c/` rejection, and NVM `#!/usr/bin/env node` resolution. |
| Why Quick is enough | Additive internal Go packages and adapter seam methods with zero changes to trust surfaces, sandbox rules, or kernel contracts. |

## Required proof

- Command/check/eval to run: five checks.
  - `cd daemon && go test -race ./internal/authprobe/... ./internal/binaryutil/... ./internal/runner -run "TestAdapter|TestBinary|TestAuth|TestProbe|TestRedact|TestSubscriptions|TestDetect"`
  - `python3 tools/check_originality.py`
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `git diff origin/main --stat -- .github/workflows policies tests/redteam spec kernel docs/adr`
- Expected result: one per check.
  - `go test -race` passes across `internal/authprobe`, `internal/binaryutil`, and `internal/runner` (exit 0);
  - `originality check passed` (exit 0);
  - `public claims check passed` (exit 0);
  - `git diff --cached --check` outputs nothing (exit 0);
  - trust-surface diff is empty (exit 0).
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: `daemon/internal/authprobe/*`, `daemon/internal/binaryutil/*`, `daemon/internal/runner/*`, and `.nuclear/changes/ao-adapter-seam/*`.
- Expected result: `git status` shows only those paths.
- Stop condition: any edit under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`, any secret value appearing in probe diagnostics, or any failing test/check.

## Escalation check

Move up to Standard if this change modifies sandbox confinement policy, kernel decision functions, red-team suites, workflows, ADRs, or public specs. None of these is modified in this change.

## Exit criteria

- Every path this change touches is named above and none is a trust surface.
- `go test -race`, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and trust-surface diff all pass and their exact outputs are recorded in `proof.md`.

## Required links

[Proof](proof.md), [binaryutil](../../../daemon/internal/binaryutil/binaryutil.go), [authprobe](../../../daemon/internal/authprobe/authprobe.go), [runner adapter seam](../../../daemon/internal/runner/adapter.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
