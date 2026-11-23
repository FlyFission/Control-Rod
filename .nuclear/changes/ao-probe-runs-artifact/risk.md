# Quick Risk: probes run the same executable a launch runs

## Selected mode

- **Mode:** Quick
- **Why this mode:** one function in `daemon/internal/runner/probe.go`, no trust surface, no contract change. This is the rework of #141 (patterns `AO-7` and `AO-8` in `docs/patterns/agent-orchestrator.md`), which failed its blind review (FIX FIRST, 6 P1).

---

## Change

- Slug: ao-probe-runs-artifact
- PR / issue: #141, reworked 2026-11-23 on branch `feat/ao-s4-adapter-seam`
- Owner: Ben Huffer (decision owner); reworked by Claude Code in the project thread "Rework the agent-orchestrator PRs"
- Date: 2026-11-23
- Summary: `ExecRunner`, which runs every probe and sign-in check, now runs the runtime artifact that `ResolveArtifact` finds, with the artifact's own environment: the same installed executable and digest a launch resolves. A probe passes the artifact it identified to every one of its commands, so it never resolves (or hashes) a second time and never falls back to the PATH entry. The sandbox preflight after a ready probe gets that artifact: its Codex feature check, which runs with the daemon's own permissions, resolves and hashes again (as on main) and refuses to run anything if the digest is not the probed one. Outside a probe, `ExecRunner` runs the PATH entry, as on main. The file at the artifact's path can still be replaced between the hash and the command's start; the status then keeps the hashed digest, and a launch checks the digest again and refuses a mismatch. A launch may also stage a private copy of that executable and checks the copy again; the probe does not stage, so a staging failure still shows at launch, not at probe. Before, it ran the PATH entry. For Codex installed through npm, that entry is a Node wrapper. A launch skips the wrapper and runs the platform binary, so on a daemon whose PATH has no `node` (launchd, systemd) the probe said "did not answer" while every launch would have worked. A runtime whose artifact cannot be resolved is not ready and nothing is run for it, as on main.
- Dropped from #141:
  - `daemon/internal/binaryutil` and `daemon/internal/authprobe`. Their resolvers had no production caller and skipped pinning.
  - The Node PATH augmentation. It made probes pass where launches would fail, which was the review's main finding.
  - The secret redaction. It knew only the daemon's own environment, and `_TOKEN` matched `CLAUDE_CODE_MAX_OUTPUT_TOKENS`.
  - The change record. It described code that was not in the diff.

## Scope

- Affected files: `daemon/internal/runner/probe.go`, `daemon.go` and `check.go` (the preflight gets the probed artifact), `sandbox.go` (`CodexEffectiveFeatures` refuses a changed executable), `probe_artifact_test.go` (new), and this record.
- Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes: a Codex npm install on a minimal PATH now probes ready when its launch would work.
- Dependency/model/API/prompt/tool permission changed? no.
- Release or rollback posture changed? no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A probe runs the artifact instead of the wrapper. If the artifact did not answer `--version`, that runtime would not be offered, which is the same thing its launch would hit. |
| Reversibility | Instant: revert the commit. |
| Detectability | High: unit tests, and `controlrod doctor` prints each probe's reason. |
| Exposure | Daemon probes on Linux and macOS. |
| Uncertainty | Low: `CodexEffectiveFeatures` already runs the artifact this way. |
| Why Quick is enough | No trust surface, contract, dependency or public claim changes. |

## Required proof

- Command/check/eval to run: three checks.
  - `cd daemon && go test ./internal/runner -run 'TestExecRunner|TestAProbeRunsTheArtifact|TestEveryCodexProbe|TestTheCodexFeatureCheck' -count=1`, and the Codex test again with `ExecRunner` made to ignore the probed artifact, where it must fail
  - `cd daemon && go test ./internal/runner -count=1`, compared with the same run on `origin/main`
  - `python3 tools/check_originality.py` and `git diff --check origin/main`
- Expected result: the new tests pass and the artifact test fails on main's `probe.go`; the full runner suite fails on exactly the tests that fail on `origin/main` on the same host; originality passes; no whitespace errors.
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the paths in Scope.
- Stop condition: any edit outside Scope, or a runner test that passes on `origin/main` and fails here.

## Escalation check

Move up to Standard if this change touches a trust surface or confinement rules. It does not.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- The checks in Required proof pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [probe](../../../daemon/internal/runner/probe.go), [artifact resolution](../../../daemon/internal/runner/artifact.go).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
