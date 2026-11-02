# PR #25 (Phase 2 part 2, tasks 2.5 to 2.9): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `runtime-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| S2-01 | Accepted, fixed | `VerifyLaunch` opens the executable, hashes the bytes through that descriptor and returns a `VerifiedLaunch`; on Linux `Apply` passes it as the child's first extra file and runs `/proc/self/fd/3`, so a file swapped at the path after the check is never what runs. Elsewhere the verified path runs (documented limit). Tests: `TestVerifiedLaunchRunsTheCheckedBytesEvenAfterTheFileIsReplaced` (checks `true`, renames `false` over it, the run still succeeds), `TestLaunchIsRefusedWhenTheExecutableIsNotTheExpectedArtifact` (bytes changed after resolution refuse). Manual check: real Claude Code and Codex binaries answer `--version` launched by descriptor inside a `systemd-run --user --scope`. |
| S2-02 | Accepted, fixed | The artifact is the native executable (ELF or Mach-O magic). Codex's npm wrapper `bin/codex.js` resolves to `node_modules/@openai/codex-<os>-<arch>/vendor/<triple>/bin/codex` (or the bundled `vendor/` layout); its digest covers the whole platform directory (binary, `rg`, `bwrap`), and the binary runs with the variables the wrapper sets. The executable's own bytes must equal the digest the tree counted. Any other script launcher is refused and the probe reports it not ready in plain words. Tests: `TestResolveArtifactRefusesScriptLaunchers`, `TestResolveArtifactFollowsTheCodexWrapperToItsNativeTree` (replacing a helper changes the digest), `TestTreeLaunchRefusesAnExecutableTheTreeDigestDidNotCount`, `TestProbeRefusesARuntimeStartedByAScriptItCannotPin`. A metadata-keyed digest cache was tried and removed: an in-place rewrite within one timestamp tick kept the old digest. Hashing in full costs well under a second for both runtimes. |
| S2-03 | Accepted, fixed | The breaker observes every event before admission bounds telemetry. Test: `TestTheBreakerSeesEventsAdmissionDrops`. |
| S2-04 | Accepted, fixed | A new connection gets a `checkpoint` frame with the head id, so the browser's EventSource holds a cursor before any event. Test: `gives a new client a checkpoint at the head` (reconnecting with that id replays what came between). |
| S2-05 | Accepted, fixed | The bus is only a wakeup. Each connection drains committed events from the table in sequence order (one drain at a time, rechecking after a wakeup that arrived mid drain). Appends hold an exclusive table lock until commit, so committed sequences are contiguous. Test: `sends events in sequence order from storage even when commit notices arrive out of order`. |
| S2-06 | Accepted, fixed | One `hookTail` is shared by the flush loop and the final drain, which continues from the same offset. Test: `TestHookTailSkipsAnOversizedRecordAndResumesWhereTheLoopStopped` (nothing reported twice). |
| S2-07 | Accepted, fixed | A hook record larger than one read is skipped to its newline with a notice, and later records are still read. Same test. |
| S2-08 | Accepted, fixed | An edit is progress only when its `tool_end` reports success for an edit call id the breaker saw start (bounded map). Test: `TestOnlyASucceededEditCountsAsProgress`. |
| S2-09 | Accepted, fixed | The replay limit is an app option (`streamReplayMax`); the test sets 20, builds more real history than that and asserts the loss frame for a valid cursor. |

Also fixed while here: the daemon's test files no longer fail to compile on macOS and Windows (a Linux-only cgroup test moved to `contain_linux_test.go`; test files that drive shell scripts are tagged `unix`), and probe tests no longer depend on which runtimes the machine has installed (`stubArtifact`).

Verification after round 1 fixes: daemon `go vet` on linux, darwin and windows; `go test ./...` passes with no runtimes on PATH; API 479 passed, 1 skipped; web 105 passed.

## Round 2 (verdict BLOCK; S2-03 to S2-09 closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| S2-01 (partial) | Accepted, fixed | After the process starts, `VerifiedLaunch.Confirm` waits until `/proc/<pid>/exe` is the descriptor's own file, then hashes that file again. Linux refuses writes to a file while it executes (ETXTBSY), so bytes that match after the start are the bytes that ran, including after an in-place rewrite between check and start. A mismatch, or a process never seen running the runtime, fails closed: the daemon stops the whole unit. Tests: `TestConfirmCatchesARuntimeRewrittenInPlaceBeforeItStarted`, `TestConfirmProvesTheStartedProcessRunsTheVerifiedBytes` (also asserts ETXTBSY), `TestConfirmFailsClosedWhenTheProcessNeverRunsTheRuntime`. A sealed memfd copy was considered and not chosen: it would hold a second in-memory copy of each runtime (Claude Code alone is over 300 MB). |
| S2-02 (partial) | Accepted, fixed | A symlink in the Codex tree that is absolute or resolves outside the tree is refused, so every link names something the tree digest hashes. Test: `TestCodexTreeRefusesLinksThatLeaveIt`. |
| S2-10 | Accepted, fixed | The trace no longer runs `<runtime> --version`. The version comes from the probe that saw the launched digest, or from the pin. `ToolVersion` is removed. Test: `TestARuntimeRefusedAtLaunchIsNeverExecuted` (a script that marks when run is never run, and the trace carries no version). |
| Medium: duplicated events | Fixed | Each batch carries `events_from`, the daemon's count of delivered events; the control plane stores each event's index (`run_events.origin`, unique per run) and drops what an earlier delivery recorded, marking a gap as `dropped`. Test: `keeps each daemon event once when a batch is resent`. |
| Medium: lost final events | Fixed | Events left after a failed final upload ride with the completion (bounded to 500, newest kept, with a dropped marker), which the durable outbox retries; every completion path records them. Tests: same API test; `TestEventsCarryTheirDeliveredIndexAndLeftoversGoWithTheCompletion`. |
| Medium: reorder test | Fixed | The test now commits two events without notices while the stream is connected and announces only the later one; the old cursor guard would have skipped the first. |

Verification after round 2 fixes: daemon `go vet` on linux, darwin and windows; `go test ./...` passes with no runtimes on PATH; API 480 passed, 1 skipped; web 105 passed; migration lock regenerated for the amended (unreleased) migration 014.
