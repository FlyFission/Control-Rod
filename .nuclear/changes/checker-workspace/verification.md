# Verification: checker workspace for the run daemon

Evidence status: **pass** for the local checks below (E-01 to E-05). **Open** for the owner's review (E-06). Nothing here claims a macOS Seatbelt run, a live Claude or Codex binary, or a headless `--safe-mode` login.

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Injected `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude` hook, `.codex` and `.agents` are withheld from the mounted tree and are not on the discovery walk from the working directory. The test asserts staging and flags; it does not launch a CLI. The hook marker is not created. Claude argv has `--disallowedTools mcp__*,Agent` and `--max-turns 8`, and not `--fallback-model` or `--safe-mode`. Codex argv has `--ignore-user-config`, `--ephemeral` and `--disable multi_agent`. `HOME` is the process home. Author argv does not gain those checker flags. | `evidence/checker-tests.log` (`TestCheckerStagesInstructionsOutOfDiscovery`, `TestCheckerMaxTurnsMatchesTheQualificationSpike`) |
| E-02 | pass | A write outside scratch and a write into the deliverable tree both fail the check with `wrote_files` and a policy notice. A hash that does not match the tree does the same and does not attach a verification. Invalid `verification.json` is refused and is not reported as a write. A short file and a full `VerificationRecord` are accepted when nothing else changed. The tree hash ignores a symlink target's bytes and changes when the link text or a file mode changes. | `evidence/checker-tests.log` |
| E-03 | pass | Without `bwrap` on `PATH` the mount fails closed. With bubblewrap 0.9.0 a write through `inputs/deliverables/` does not change the source tree, and scratch stays writable. A verified descriptor is mounted with `--ro-bind-fd` back onto its own path. `ConfirmSandbox` accepts the child; `Confirm` does not accept the bubblewrap process. The Seatbelt profile denies `file-write*` on the deliverable path and does not use `(deny default)`. The profile was not executed. | `evidence/checker-tests.log`, `evidence/bwrap-version.txt` |
| E-04 | pass | Author launch golden files are not in the diff. Pre-check goldens change only the prompt and, for Claude, `--disallowedTools` and `--max-turns`. `TestLaunchGolden` and `TestDaemonRunsAFakeJobEndToEnd` pass. | `evidence/diff-stat-tracked.txt`, `evidence/checker-tests.log` |
| E-05 | pass | From `daemon/`: `gofmt -l .` prints nothing. `go vet ./...` exits 0 for linux, `GOOS=darwin`, and `GOOS=windows`. `go test -count=1 ./...` exits 0. | `evidence/gofmt.log`, `evidence/vet.log`, `evidence/test.log` |
| E-06 | open | Owner review of the pull request, which depends on #76. | Not executed |

## Review fixes

Codex and agy requested changes on the first commit. The mount is `--ro-bind / /` plus the writable exceptions named in `docs/daemon.md`. Writes to `HOME`, a path beside the workspace, and the host `/tmp` are covered by `TestCheckerMountBlocksWritesOutsideScratch`. Seatbelt paths are canonicalized and the profile denies every `file-write*` except the paths it is given. The tree hash length-prefixes each field; `TestTreeDigestLengthPrefixDoesNotCollide` shows the old NUL encoding collides and the new digest does not. Reserved instruction names are withheld from the mount and listed in the brief, and the discovery walk goes to `/`. A prepared checker may write `scratch/criterion-results.json`; `TestPreparedCheckerThroughTheMount` runs that write under bubblewrap. Short verification files are checked against `checker_file.schema.json` after duplicate keys are rejected. File bytes are streamed, with the existing 20 MB and 100 MB caps and an entry cap of `MaxOutputTotal/4096`. The verified path is `VerifiedLaunch.Path`, not a `/proc/self/fd` read. Confirmation follows descendants of the started process, so a checker under `systemd-run` and bubblewrap still matches. The confirmation test copies `sleep` to a regular file in the workspace: on the CI image `/bin/sleep` is a symlink, and mounting the descriptor onto that symlink does not execute the opened inode. A mount or hash failure before start records a policy notice on the completion.

The second review still requested changes. The mount now adds `--unshare-pid` and `--proc /proc`, so a host pid's `root` and `fd` are not a way out. Withheld filenames are validated first and rendered as a JSON list. `CLAUDE.local.md` and `AGENTS.override.md` are reserved, case-insensitively. Deliverable artifact digests are the raw SHA-256. `StageRoot` is read-only after the tmpfs. An empty `VerifiedPath` does not bind a descriptor. `TestCheckerStagesInstructionsOutOfDiscovery` does not launch a CLI. A real Claude or Codex discovery check is still pending on the owner's Mac.

The third review still requested changes on the login directory. The real directory stays read-only. On Linux, session directories are empty per-run directories mounted over the real ones, and a symlink is not a write path. A login directory under `/tmp` and one under `/var/tmp` are both covered. Protected hashes include the directory's absence, and each name's kind, mode, and capped contents. Claude checkers set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `autoMemoryEnabled: false`. The fake prepared brief still allows separate `out/` evidence files. A sandboxed checker may write `scratch/evidence/`, and the daemon uploads those files as `evidence/<relative name>`. `prepared-checker-evidence.test.ts` passes a prepared criterion that requires an evidence artifact for both.

The fourth review asked to hide host Unix sockets and to stop sharing the login overlay. Linux adds `--unshare-ipc`, tmpfs mounts on the user and D-Bus runtime directories, and `/dev/null` over the docker, ssh-agent, and gpg-agent socket paths. `TestCheckerCannotReachAHostUnixSocket` is a host socket outside `/tmp` that writes nothing when the checker tries to connect. macOS cannot remap session paths. No documented variable moves only those directories while leaving the credential file in place, so the profile denies reads of the real directories and denies outbound Unix sockets. That profile was not executed. A blanket mach-lookup deny is not in the profile. Each overlay is `MkdirTemp`, and removing one does not remove another run's directory or a pre-existing `login-overlay` residue.

## What was not qualified

- macOS Seatbelt execution. `sandbox-exec` was not run. `TestSeatbeltProfileDeniesWritesExceptScratch` checks the profile text, and `GOOS=darwin go test -c` compiles the darwin tests.
- A real Claude Code or Codex binary. CI does not have them. `TestCheckerStagesInstructionsOutOfDiscovery` asserts staging and flags only. The owner will run the real-CLI discovery check on a Mac. The tests here assert argv, the working directory, and a shell under bubblewrap.
- Claude `--safe-mode` with `-p`. It is not passed, because it was not shown to keep an OAuth or keychain login headless.
- A flag that suppresses user-level `~/.claude/CLAUDE.md` and `~/.codex` `AGENTS.md` while keeping the login. `--setting-sources` does not. The upward walk no longer passes those directories when the working directory is relocated.
- An evidence file other than `scratch/verification.json` and `scratch/criterion-results.json`. No spec or kernel change: `wrote_files` is the completion error and a policy notice, not a `VerificationRecord` outcome.

## Spec

`spec/` is not edited. The daemon embeds the existing `VerificationRecord.json`, `Finding.json`, `EvidenceItem.json`, and `CriterionResultSubmission.json` by regenerating `daemon/internal/wire/schemas/` from `scripts/generate-runner-schemas.mjs`. The short checker file schema lives in `daemon/internal/runner/checker_file.schema.json` and is not a contract change.

## Evidence custody and coupling

| Evidence ID | Claim ID | Decisive? | Artifact / raw result | Change actor | Generated by | Selected by | Transformed / summarized by | Executed / captured by | Retained by | Presented by | Verified / witnessed by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | T-01, T-02, T-07 | yes | evidence/checker-tests.log | Implementing agent | `go test` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-02 | T-03, T-04, T-05 | yes | evidence/checker-tests.log | Implementing agent | `go test` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-03 | T-05, T-07, T-08 | yes | evidence/checker-tests.log, evidence/bwrap-version.txt | Implementing agent | `go test`, `bwrap --version` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-04 | T-06 | yes | evidence/diff-stat-tracked.txt, evidence/checker-tests.log | Implementing agent | `git diff`, `go test` | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-05 | T-09 | yes | evidence/gofmt.log, evidence/vet.log, evidence/test.log | Implementing agent | gofmt, go vet, go test | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-06 | T-09 | yes | Owner review | Implementing agent | Not executed | Owner | Not executed | Not executed | Packet | Implementing agent | Not supplied |

| Evidence ID | Actor | Context | Mechanism | Authority | Resource | Classification | Admissibility / residual-risk disposition |
|---|---|---|---|---|---|---|---|
| E-01 | coupled: implementing agent wrote the test and the workspace | coupled: one session | separated: argv and directory assertions | separated: owner retains merge decision | coupled: local machine | self-check | No real CLI; discovery is the walk the test performs [Ship limits](ship.md) |
| E-02 | coupled: implementing agent | coupled: one session | separated: hash and schema checks | separated: owner retains merge decision | coupled: local machine | self-check | `wrote_files` is not a schema outcome [Ship limits](ship.md) |
| E-03 | coupled: implementing agent | coupled: one session | separated: bubblewrap on this host; profile text only for Seatbelt | separated: owner retains merge decision | coupled: local machine | self-check | macOS was not run; bubblewrap is 0.9.0 [Ship limits](ship.md) |
| E-04 | coupled: implementing agent | partially separated: author bytes are the fixtures from pull request #76 | separated: byte comparison | separated: owner retains merge decision | coupled: local machine | self-check | Only the two pre-check golden files differ [Ship limits](ship.md) |
| E-05 | coupled: implementing agent | coupled: one session | separated: gofmt, vet, test | separated: owner retains merge decision | coupled: local machine | self-check | Local toolchain only [Ship limits](ship.md) |
| E-06 | separated: owner | separated: owner's own review | separated: the owner's review has not run | separated: owner decides | coupled: local machine | self-check | Not executed [Ship limits](ship.md) |

No human independent review has been done yet.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
