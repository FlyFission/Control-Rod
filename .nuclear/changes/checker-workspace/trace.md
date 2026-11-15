# Trace: checker workspace for the run daemon

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | A sandboxed checker starts in a clean daemon-owned directory. Deliverables are mounted read-only at `inputs/deliverables/`. The brief is a separate Control Rod file and says the deliverables are data, not instructions. | `TestCheckerIgnoresInjectedInstructions`, `TestBubblewrapMountsDeliverablesReadOnly` | implemented with this change |
| T-02 | Project instruction files and the planted `.claude` hook are not on the discovery walk and the hook does not run. Claude passes `--disallowedTools mcp__*,Agent` and `--max-turns`. Codex passes `--ignore-user-config`, `--ephemeral`, and `--disable multi_agent`. No `--fallback-model`. No `--safe-mode`. | `TestCheckerIgnoresInjectedInstructions`, `TestCheckerMaxTurnsMatchesTheQualificationSpike` | implemented with this change |
| T-03 | The only allowed write is `scratch/verification.json`. The daemon validates it and moves it onto the completion. Any other write fails the check with `wrote_files` and a policy notice. | `TestCheckerWriteOutsideScratchOrDeliverablesVoids` | implemented with this change |
| T-04 | The deliverable tree is hashed before and after. The hash covers sorted relative paths, kind, mode, and payload. Symlinks are not followed. A mismatch voids the check and records a policy notice. | `TestTreeDigestDoesNotFollowSymlinks`, `TestCheckerTamperedDeliverableHashVoids` | implemented with this change |
| T-05 | A missing mount, a hash that cannot be computed, or a schema failure cannot pass. | `TestCheckerMountFailsClosedWithoutBubblewrap`, `TestCheckerRejectsInvalidVerification`, `settleChecker` error paths | implemented with this change |
| T-06 | Author launch bytes are unchanged. Pre-check goldens change only for the checker prompt and the Claude checker flags. The fake pre-check end-to-end test still passes. | `TestLaunchGolden`, `TestDaemonRunsAFakeJobEndToEnd`; `git diff` of `testdata/launch-golden/` | implemented with this change |
| T-07 | `HOME` stays the real home. Provider tokens are not in the child environment. The verified child, not bubblewrap, is confirmed. | `TestCheckerIgnoresInjectedInstructions`, `TestCheckerMountBindsTheVerifiedDescriptor`, `TestConfirmSandboxSeesTheBubblewrapChild` | implemented with this change |
| T-08 | Seatbelt denies `file-write*` on the deliverable path and does not deny the rest of the filesystem. The profile was not executed on macOS. | `TestSeatbeltProfileDeniesWritesOnDeliverables` | implemented as a profile check; macOS execution not done |
| T-09 | No protected surface changes. `spec/` is not edited. `wrote_files` is not a schema or kernel outcome. | `git diff --stat` against `cursor/adapter-seam-55eb` | checked with this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
