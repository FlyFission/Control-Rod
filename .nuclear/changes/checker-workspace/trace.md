# Trace: checker workspace for the run daemon

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | A sandboxed checker starts in a clean daemon-owned directory. Deliverables are a real read-only directory at `inputs/deliverables/`. The brief is a separate Control Rod file and says the deliverables are data, not instructions. Withheld names are a JSON list. | `TestCheckerStagesInstructionsOutOfDiscovery`, `TestBubblewrapMountsDeliverablesReadOnly` | implemented with this change |
| T-02 | Project instruction files and the planted `.claude` hook are not on the discovery walk. The test asserts staging and flags; it does not launch a CLI. Claude passes `--disallowedTools mcp__*,Agent` and `--max-turns`. Codex passes `--ignore-user-config`, `--ephemeral`, and `--disable multi_agent`. No `--fallback-model`. No `--safe-mode`. | `TestCheckerStagesInstructionsOutOfDiscovery`, `TestCheckerMaxTurnsMatchesTheQualificationSpike` | implemented with this change; real-CLI discovery pending |
| T-03 | The only allowed write is `scratch/verification.json`. The daemon validates it and moves it onto the completion. Any other write fails the check with `wrote_files` and a policy notice. | `TestCheckerWriteOutsideScratchOrDeliverablesVoids` | implemented with this change |
| T-04 | The deliverable tree is hashed before and after. The hash covers sorted relative paths, kind, mode, and payload. Symlinks are not followed. A mismatch voids the check and records a policy notice. | `TestTreeDigestDoesNotFollowSymlinks`, `TestCheckerTamperedDeliverableHashVoids` | implemented with this change |
| T-05 | A missing mount, a hash that cannot be computed, or a schema failure cannot pass. | `TestCheckerMountFailsClosedWithoutBubblewrap`, `TestCheckerRejectsInvalidVerification`, `settleChecker` error paths | implemented with this change |
| T-06 | Author launch bytes are unchanged. Pre-check goldens change only for the checker prompt and the Claude checker flags. The fake pre-check end-to-end test still passes. | `TestLaunchGolden`, `TestDaemonRunsAFakeJobEndToEnd`; `git diff` of `testdata/launch-golden/` | implemented with this change |
| T-07 | `HOME` stays the real home. Provider tokens are not in the child environment. The verified child, not bubblewrap, is confirmed. | `TestCheckerStagesInstructionsOutOfDiscovery`, `TestCheckerMountBindsTheVerifiedDescriptor`, `TestConfirmSandboxSeesTheBubblewrapChild` | implemented with this change |
| T-08 | Seatbelt denies every `file-write*` except the paths it is given: canonical scratch, one per-run temporary directory, and the active CLI's credential file and session directories. Paths are canonicalized. The profile was not executed on macOS. Darwin tests compile. | `TestSeatbeltProfileDeniesWritesExceptScratch`, `TestCanonicalPathResolvesTheAncestorSymlink`, `GOOS=darwin go test -c` | implemented as a profile check; macOS execution not done |
| T-09 | No protected surface changes. `spec/` is not edited. `wrote_files` is not a schema or kernel outcome. | `git diff --stat` against `cursor/adapter-seam-55eb` | checked with this change |
| T-10 | Host `/proc/<pid>/root` and `/fd` are not reachable. The staged runtime root is read-only after the tmpfs. An empty verified path does not bind a descriptor. | `TestCheckerProcDoesNotReachHostProcesses`, `TestCheckerMountRestoresTheStagedRuntimeAndSkipsAnEmptyVerifiedPath` | implemented with this change |
| T-11 | The active login directory cannot gain or change an instruction or settings file. A session directory stays writable. A change after the snapshot voids the check. | `TestCheckerCannotRewriteLoginInstructions` | implemented with this change |
| T-12 | A filename with a newline or a control character is rejected. `CLAUDE.local.md` and `AGENTS.override.md` are reserved, case-insensitively. Deliverable artifact digests are raw SHA-256. | `TestCheckerRejectsFilenamesThatCouldRewriteTheBrief`, `TestCheckerRelocatesAwayFromInstructionAncestors`, `TestDeliverableArtifactsAreNotDuplicated` | implemented with this change |
| T-13 | A prepared fake brief names `out/`. A prepared sandboxed brief names `scratch/`. Both `checker:` references use the uploaded names. | `prepared-checker-paths.test.ts` | implemented with this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
