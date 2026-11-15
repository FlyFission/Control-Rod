# Basis: checker workspace for the run daemon

**Change slug:** `checker-workspace`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-15
**Decision this basis supports:** whether a pre-check on Claude Code or Codex starts outside the deliverable tree, with that tree read-only, and whether a check that writes elsewhere or fails its schema can still pass.

## Mission / need

Milestone 2 of the multi-provider plan. Today a pre-check runs in the same workspace as the deliverables and writes `out/verification.json`. Instruction files and hooks planted in the deliverables sit on the working-directory discovery path. This change gives the checker role, and only that role, a clean daemon-owned working directory, a read-only deliverable mount, a scratch file for the verdict, and a before/after hash. Author and intake launches stay as they are. The fake runtime's pre-check stays on the old layout so the existing end-to-end test still describes that runtime.

Depends on the adapter seam, pull request #76, branch `cursor/adapter-seam-55eb`. That pull request is not merged. This branch is cut from it.

The milestone text is the design input. No separate multi-provider design file is in this tree. ADR 0021 still holds: each CLI keeps the real `HOME` for its own login. This change does not set a private home and does not read or copy a token.

## Scope

In scope: `daemon/` (checker workspace, mount, hash, schema check, checker launch flags, tests, regenerated runner schemas), `docs/daemon.md`, `packs/general/roles/pre-check.md`, `services/api/src/work.ts` (the prepared pre-check brief: fake stays on `out/`, a sandboxed checker uses `scratch/`, and `checker:` references name the uploaded files), and this packet.

Out of scope: `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` (no contract edit), author and intake argv, the fake runtime's pre-check layout, and a private `HOME`.

## Fixed inputs

- ADR 0021: real login, no token handling in Control Rod.
- The pre-refactor author launch fixtures in `daemon/internal/runner/testdata/launch-golden/`. Those bytes are not rewritten.
- `--max-turns 8` is the bound already passed by `spikes/runtime-confinement/launch_qualification.py` on a headless Claude print session. `TestCheckerMaxTurnsMatchesTheQualificationSpike` fails if that spike and the checker constant disagree. It is not a new measurement.
- Verification shape is the existing `VerificationRecord.json` for a full record, and the checker's two fields (`outcome`, `findings`, optional `evidence`) checked against `Finding.json` and `EvidenceItem.json`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A clean working directory keeps project `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/`, `.codex/` and `.agents/` off the discovery walk. | Those CLIs discover them from the working directory and its parents, not from `inputs/deliverables/`. | A CLI that loads instruction files from a subdirectory of the working directory. |
| `--setting-sources ""` does not block `CLAUDE.md` or auto-memory. | The milestone states it. The clean directory is the control this change adds. | A measured Claude build where those flags do block both, recorded with the same method as the phase 6 ambient check. |
| Bubblewrap `--die-with-parent --unshare-pid --ro-bind / / --proc /proc`, with scratch writable, a tmpfs on `/tmp`, and only the active CLI's credential file and session directories writable, blocks host writes outside those exceptions. `/proc/<host-pid>/root` and `/proc/<host-pid>/fd` are not visible. The deliverable directory is read-only. `StageRoot` is mounted read-only again after the tmpfs when it exists. | `TestCheckerMountBlocksWritesOutsideScratch`, `TestCheckerProcDoesNotReachHostProcesses`, and `TestBubblewrapMountsDeliverablesReadOnly` on this machine (bubblewrap 0.9.0). | A host where a write to `HOME`, a path beside the workspace, or the host `/tmp` succeeds, or where a host pid's root is readable inside the mount. |
| The sandboxed child, not bubblewrap, is the process that must be the verified executable. Host `/proc` still shows the child's host pid, so `Confirm` can see it after `--unshare-pid`. | `VerifiedLaunch.Confirm` compares `/proc/<pid>/exe` to the opened file. `ConfirmSandbox` follows descendants. `TestConfirmSandboxSeesTheBubblewrapChild`. | A bubblewrap that hides the child's host pid from the daemon. |
| The real login directory stays read-only except the credential file, and only when that file is a regular file owned by this user and contained in the login directory. Session directories (`projects`, `debug`, `todos`; `sessions`, `log`) are covered by empty per-run directories, not writable views of the real ones. A missing session directory is not created on the host. A symlink is not mounted. A login directory under `/tmp` is mounted read-only after the tmpfs. The directory's existence is part of the hash, and each protected name records kind, mode, and contents. Those session directory names were not remeasured against a live CLI. | `TestCheckerCannotRewriteLoginInstructions` (a login directory under `/tmp` and under `/var/tmp`), `TestCheckerSessionSymlinkDoesNotGrantHomeWrites`, `TestAbsentLoginDirectoryIsPartOfTheHash`. | A measured CLI that must write a session path other than those names and cannot run a checker without it. |
| `--safe-mode` is not passed. | Claude Code is not installed here, so it was not shown to work with `-p` while keeping an OAuth or keychain login. | A recorded headless `-p` run with `--safe-mode` that still uses the existing login. |
| A prepared sandboxed checker writes `scratch/verification.json`, `scratch/criterion-results.json`, and evidence files under `scratch/evidence/`. The daemon uploads those evidence files as `evidence/<relative name>`. The fake runtime still writes `out/`, including separate evidence files referenced as `checker:<relative file name>`. | `preparedCheckerOutputPaths`, `TestPreparedCheckerThroughTheMount`, and `prepared-checker-evidence.test.ts`. | A prepared check that must attach an evidence file outside those locations. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
